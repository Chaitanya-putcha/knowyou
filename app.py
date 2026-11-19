import os
from flask import Flask, render_template, request, redirect, url_for, flash, abort, jsonify
from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_login import(
    LoginManager, UserMixin, login_user, logout_user,
    login_required, current_user,
)
from werkzeug.security import generate_password_hash, check_password_hash 
from datetime import datetime, date
from analysis import (
    analyze_mood, build_insights, MOOD_EMOJI, 
    detect_emotions, summarize, EMOTION_EMOJI,
)

app = Flask(__name__)

IS_PRODUCTION = os.environ.get("PRODUCTION") == "1"

secret_key = os.environ.get("SECRET_KEY")
if IS_PRODUCTION and not secret_key:
    raise RuntimeError("SECRET_KEY must be set in production.")
app.config["SECRET_KEY"] = secret_key or "dev-secret-change-this-later"

database_url = os.environ.get("DATABASE_URL", "sqlite:///knowyou.db")
if database_url.startswith("postgres://"):
    database_url = database_url.replace("postgres://", "postgresql://", 1)
app.config["SQLALCHEMY_DATABASE_URI"] = database_url
app.config["SQLALCHEMY_ENGINE_OPTIONS"] = {"pool_pre_ping":True}

app.config["SESSION_COOKIE_SAMESITE"] = "Lax"
if IS_PRODUCTION:
    app.config["SESSION_COOKIE_SECURE"] = True


db = SQLAlchemy(app)
migrate = Migrate(app, db, render_as_batch=True)
app.jinja_env.globals["MOOD_EMOJI"] = MOOD_EMOJI
app.jinja_env.globals["EMOTION_EMOJI"] = EMOTION_EMOJI

login_manager = LoginManager(app)
login_manager.login_view = "login"
login_manager.login_message = "Please log in to continue."

# Database Models
class User(UserMixin, db.Model):
    id = db.Column(db.Integer, primary_key=True)
    username = db.Column(db.String(50), unique=True, nullable=False)
    password_hash = db.Column(db.String(256), nullable=False)

    entries = db.relationship("Entry", backref="owner", cascade="all, delete-orphan")
    gratitudes = db.relationship("Gratitude", backref="owner", cascade="all, delete-orphan")
    goals = db.relationship("Goal" , backref="owner", cascade="all, delete-orphan")

class Entry(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.Text, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    mood_score = db.Column(db.Float)
    mood_label = db.Column(db.String(20))
    emotion = db.Column(db.String(20))
    emotion_score = db.Column(db.Float)
    emotion_scores = db.Column(db.JSON)
    summary = db.Column(db.Text)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

class Gratitude(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    content = db.Column(db.String(300), nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)

class Goal(db.Model):
    id = db.Column(db.Integer, primary_key=True)
    title = db.Column(db.String(200), nullable=False)
    target_date = db.Column(db.Date)
    is_done = db.Column(db.Boolean, default=False, nullable=False)
    created_at = db.Column(db.DateTime, default=datetime.now)
    user_id = db.Column(db.Integer, db.ForeignKey("user.id"), nullable=False)


@login_manager.user_loader
def load_user(user_id):
    return db.session.get(User, int(user_id))

# Helper
def get_owned_or_404(model, item_id):
    item = db.get_or_404(model, item_id)
    if item.user_id != current_user.id:
        abort(403)
    return item

# Home Page
@app.route("/")
def home():
    stats = None
    if current_user.is_authenticated:
        stats = {
            "entries": len(current_user.entries),
            "gratitudes": len(current_user.gratitudes),
            "goals_done": len([g for g in current_user.goals if g.is_done]),
            "goals_total": len(current_user.goals)
        }
    return render_template("home.html", stats=stats)

# Registration
@app.route("/register", methods=["GET", "POST"])
def register():
    if current_user.is_authenticated:
        return redirect(url_for("journal"))

    if request.method == "POST":
        username = request.form["username"].strip()
        password = request.form["password"]

        if not username or not password:
            flash("Please fill in both fields.")
            return redirect(url_for("register"))

        if len(password) < 6:
            flash("Password must be at least 6 characters.")
            return redirect(url_for("register"))

        existing = db.session.scalar(db.select(User).filter_by(username=username))
        if existing:
            flash("That username is already taken.")
            return redirect(url_for("register"))

        user = User(username=username, password_hash=generate_password_hash(password))
        db.session.add(user)
        db.session.commit()

        login_user(user)
        flash(f"Welcome to KnowYou, {username}")
        return redirect(url_for("journal"))

    return render_template("register.html")

# Login
@app.route("/login", methods=["GET", "POST"])
def login():
    if current_user.is_authenticated:
        return redirect(url_for("journal"))
    
    if request.method == "POST":
        username = request.form["username"].strip()
        password = request.form["password"]

        user = db.session.scalar(db.select(User).filter_by(username=username))

        if user is None or not check_password_hash(user.password_hash, password):
            flash("Invalid username or password.")
            return redirect(url_for("login"))

        login_user(user)
        flash(f"Welcome back, {user.username}!")
        return redirect(url_for("journal"))

    return render_template("login.html")

# logout
@app.route("/logout")
@login_required
def logout():
    logout_user()
    flash("you have been logged out")
    return redirect(url_for("home"))
        
# Journal
@app.route("/journal", methods=["GET", "POST"])
@login_required
def journal():
    if request.method == "POST":
        content = request.form["content"].strip()

        if content:
            score, label = analyze_mood(content)
            emotion, emotion_score, emotion_scores = detect_emotions(content)
            summary = summarize(content)
            new_entry = Entry(
                content=content, 
                mood_score=score, 
                mood_label=label, 
                emotion=emotion,
                emotion_score=emotion_score,
                emotion_scores=emotion_scores,
                summary=summary,
                user_id=current_user.id,
                )
            db.session.add(new_entry)
            db.session.commit()
        
        return redirect(url_for("journal"))

    entries = db.session.scalars(
        db.select(Entry)
        .filter_by(user_id=current_user.id)
        .order_by(Entry.created_at.desc())
    ).all()
    return render_template("journal.html", entries=entries)

@app.route("/entry/<int:entry_id>/delete", methods=["POST"])
@login_required
def delete_entry(entry_id):
    entry = get_owned_or_404(Entry, entry_id)
    db.session.delete(entry)
    db.session.commit()
    return redirect(url_for("journal"))

# Gratitude
@app.route("/gratitude", methods=["GET", "POST"])
@login_required
def gratitude():
    if request.method == "POST":
        content = request.form["content"].strip()
        if content:
            db.session.add(Gratitude(content=content, user_id=current_user.id))
            db.session.commit()
        return redirect(url_for("gratitude"))
    items = db.session.scalars(
        db.select(Gratitude)
        .filter_by(user_id=current_user.id)
        .order_by(Gratitude.created_at.desc())
    ).all()
    today_count = len([i for i in items if i.created_at.date() == date.today()])
    return render_template("gratitude.html", items=items, today_count=today_count)

@app.route("/gratitude/<int:item_id>/delete", methods=["POST"])
@login_required
def delete_gratitude(item_id):
    item = get_owned_or_404(Gratitude, item_id)
    db.session.delete(item)
    db.session.commit()
    return redirect(url_for("gratitude"))

# Goals
@app.route("/goals", methods=["GET", "POST"])
@login_required
def goals():
    if request.method == "POST":
        title = request.form["title"].strip()
        target_text = request.form.get("target_date", "")

        target_date = None
        if target_text:
            try:
                target_date = date.fromisoformat(target_text)
            except ValueError:
                flash("That date doesn't look right")
                return redirect(url_for("goals"))
        if title:
            db.session.add(Goal(title=title, target_date=target_date, user_id=current_user.id))
            db.session.commit()
        return redirect(url_for("goals"))
    all_goals = db.session.scalars(
        db.select(Goal)
        .filter_by(user_id=current_user.id)
        .order_by(Goal.created_at.desc())
    ).all()
    active = [g for g in all_goals if not g.is_done]
    completed = [g for g in all_goals if g.is_done]
    return render_template("goals.html", active=active, completed=completed, today=date.today())

@app.route("/goals/<int:goal_id>/toggle", methods=["POST"])
@login_required
def toggle_goal(goal_id):
    goal = get_owned_or_404(Goal, goal_id)
    goal.is_done = not goal.is_done
    db.session.commit()
    return redirect(url_for("goals"))

@app.route("/goals/<int:goal_id>/delete", methods=["POST"])
@login_required
def delete_goal(goal_id):
    goal = get_owned_or_404(Goal, goal_id)
    db.session.delete(goal)
    db.session.commit()
    return redirect(url_for("goals"))

@app.route("/insights")
@login_required
def insights():
    data = build_insights(
        current_user.entries,
        current_user.gratitudes,
        current_user.goals,
        date.today(),
    )
    return render_template("insights.html", insights=data)


@app.route("/api/mood-data")
@login_required
def mood_data():
    entries = db.session.scalars(
        db.select(Entry)
        .filter_by(user_id=current_user.id)
        .order_by(Entry.created_at)
    ).all()

    points = [
        {
            "date":e.created_at.strftime("%d %b"),
            "score":round(e.mood_score, 2),
            "emotion":e.emotion,
        }
        for e in entries
        if e.mood_score is not None
    ]
    return jsonify(points[-30:])


if __name__ == "__main__":
    app.run(debug=True)