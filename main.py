from flask import Flask, render_template, request, redirect, url_for, session, jsonify, flash
from flask_restful import Resource, Api
import os
from datetime import datetime
import numpy as np
from tensorflow.keras.models import load_model
from tensorflow.keras.preprocessing import image
from werkzeug.utils import secure_filename
from werkzeug.security import generate_password_hash, check_password_hash
from flask_pymongo import PyMongo
from bson.objectid import ObjectId
from huggingface_hub import hf_hub_download

app = Flask(__name__)
app.secret_key = "dermalens_secret_key"
api = Api(app)  # Initialize REST API

# MongoDB Configuration
app.config["MONGO_URI"] = os.environ.get("MONGO_URI", "mongodb://localhost:27017/dermalens_db")
mongo = PyMongo(app)
db = mongo.db

# Upload folder
UPLOAD_FOLDER = os.path.join("static", "uploads")
app.config["UPLOAD_FOLDER"] = UPLOAD_FOLDER

# Load trained model
MODEL_FILE = "skin_cancer_cnn.h5"

try:
    if not os.path.exists(MODEL_FILE):
        print("Downloading model from Hugging Face...")

        hf_hub_download(
            repo_id="Mitanshu10/dermalens-skin-cancer-model",
            filename=MODEL_FILE,
            local_dir="."
        )

    model = load_model(MODEL_FILE)

except Exception as e:
    print(f"Model loading failed: {e}")
    raise


# ================= HOME =================
@app.route("/")
def home():
    return render_template(
        "home.html",
        logged_in=session.get("logged_in", False)
    )


# ================= ABOUT =================
@app.route("/about")
def about():
    return render_template(
        "about.html",
        logged_in=session.get("logged_in", False)
    )


# ================= CONTACT =================
@app.route("/contact", methods=["GET", "POST"])
def contact():
    if request.method == "POST":
        name = request.form.get("name")
        email = request.form.get("email")
        message = request.form.get("message")

        db.messages.insert_one({
            "name": name,
            "email": email,
            "message": message,
            "timestamp": datetime.utcnow()
        })
        flash("Your message has been sent successfully!", "success")
        return redirect(url_for("contact"))

    return render_template(
        "contact.html",
        logged_in=session.get("logged_in", False)
    )


# ================= REGISTER =================
@app.route("/register", methods=["GET", "POST"])
def register():
    if request.method == "POST":
        name = request.form.get("name")
        email = request.form.get("email")
        password = request.form.get("password")

        # Check existing
        if db.users.find_one({"email": email}):
            flash("Email already registered. Please log in.", "danger")
            return redirect(url_for("register"))

        # Hash and Insert
        hashed_password = generate_password_hash(password)
        user_id = db.users.insert_one({
            "name": name,
            "email": email,
            "password": hashed_password,
            "created_at": datetime.utcnow()
        }).inserted_id

        session["user_id"] = str(user_id)
        session["name"] = name
        session["logged_in"] = True
        
        flash(f"Welcome to DermaLens, {name}!", "success")
        return redirect(url_for("home"))

    return render_template("register.html")


# ================= LOGIN =================
@app.route("/login", methods=["GET", "POST"])
def login():
    if request.method == "POST":
        email = request.form.get("email")
        password = request.form.get("password")

        user = db.users.find_one({"email": email})
        
        if user and check_password_hash(user["password"], password):
            session["user_id"] = str(user["_id"])
            session["name"] = user.get("name", "User")
            session["logged_in"] = True

            flash(f"Welcome back, {session['name']}!", "success")
            return redirect(url_for("home"))
        else:
            flash("Invalid email or password", "danger")
            return redirect(url_for("login"))

    return render_template("login.html")


# ================= LOGOUT =================
@app.route("/logout")
def logout():
    session.clear()
    flash("You have been logged out.", "info")
    return redirect(url_for("home"))


# ================= PREDICT =================
@app.route("/predict", methods=["GET", "POST"])
def predict():

    # 🔒 Protect page
    if not session.get("logged_in"):
        return redirect(url_for("login"))

    prediction = None
    confidence = None
    image_path = None
    history = []

    user_id = session.get("user_id")
    if user_id:
        history = list(db.predictions.find({"user_id": ObjectId(user_id)}).sort("timestamp", -1))

    if request.method == "POST":
        file = request.files.get("file")

        if file and file.filename != "":
            os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(filepath)

            # Preprocess image
            img = image.load_img(filepath, target_size=(224, 224))
            img_array = image.img_to_array(img) / 255.0
            img_array = np.expand_dims(img_array, axis=0)

            pred_value = model.predict(img_array)[0][0]

            pred_value = model.predict(img_array)[0][0]

            if pred_value > 0.5:
                prediction = "Malignant"
                confidence = round(float(pred_value * 100), 2)
            else:
                prediction = "Benign"
                confidence = round(float((1 - pred_value) * 100), 2)


            image_path = "/" + filepath
            
            if session.get("logged_in") and session.get("user_id"):
                db.predictions.insert_one({
                    "user_id": ObjectId(session["user_id"]),
                    "diagnosis": prediction,
                    "confidence": confidence,
                    "image_path": image_path,
                    "timestamp": datetime.utcnow()
                })

    return render_template(
        "predict.html",
        prediction=prediction,
        confidence=confidence,
        image_path=image_path,
        history=history,
        logged_in=session.get("logged_in", False)
    )


# ================= REST API RESOURCE =================
class PredictAPI(Resource):
    """
    RESTful API Endpoint to handle image prediction.
    Clients can send a POST request with an image file to receive JSON predictions.
    """
    def post(self):
        # 1. Check if file is in the request
        if 'file' not in request.files:
            return {"success": False, "error": "No file parameter found in request"}, 400
            
        file = request.files['file']
        
        # 2. Check if a valid filename exists
        if file.filename == "":
            return {"success": False, "error": "Empty filename provided"}, 400

        try:
            # 3. Save the file
            os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config["UPLOAD_FOLDER"], filename)
            file.save(filepath)

            # 4. Preprocess and Predict
            img = image.load_img(filepath, target_size=(224, 224))
            img_array = image.img_to_array(img) / 255.0
            img_array = np.expand_dims(img_array, axis=0)

            pred_value = model.predict(img_array)[0][0]

            # 5. Format Results
            if pred_value > 0.5:
                prediction = "Malignant"
                confidence = round(float(pred_value * 100), 2)
            else:
                prediction = "Benign"
                confidence = round(float((1 - pred_value) * 100), 2)

            image_path = url_for('static', filename='uploads/' + filename)

            # 5b. Save to Database if logged in
            if session.get("logged_in") and session.get("user_id"):
                db.predictions.insert_one({
                    "user_id": ObjectId(session["user_id"]),
                    "diagnosis": prediction,
                    "confidence": confidence,
                    "image_path": image_path,
                    "timestamp": datetime.utcnow()
                })

            # 6. Return JSON response
            return {
                "success": True,
                "prediction": prediction,
                "confidence": confidence,
                "image_path": image_path
            }, 200

        except Exception as e:
            return {"success": False, "error": str(e)}, 500

# Bind the Resource to the specific API Endpoint
api.add_resource(PredictAPI, '/api/predict')


if __name__ == "__main__":
    app.run(debug=True)
