from __future__ import annotations

import os

from dotenv import load_dotenv
from flask import Flask, jsonify, render_template, request, send_from_directory, session
from flask_sqlalchemy import SQLAlchemy
from werkzeug.security import check_password_hash, generate_password_hash

load_dotenv()


def create_app(test_config=None):
    app = Flask(__name__, static_folder='.', static_url_path='', template_folder='templates')
    environment = os.getenv('APP_ENV', 'development').lower()
    secret_key = os.getenv('SECRET_KEY')
    database_url = os.getenv('DATABASE_URL')

    if environment == 'production' and not secret_key:
        raise RuntimeError('SECRET_KEY must be configured in production.')
    if environment == 'production' and not database_url:
        raise RuntimeError('DATABASE_URL must be configured in production.')

    database_url = database_url or 'sqlite:///knowyou.db'
    if database_url.startswith('postgres://'):
        database_url = database_url.replace('postgres://', 'postgresql+psycopg2://', 1)
    elif database_url.startswith('postgresql://'):
        database_url = database_url.replace('postgresql://', 'postgresql+psycopg2://', 1)

    app.config['SECRET_KEY'] = secret_key or 'knowyou-dev-secret'
    app.config['SQLALCHEMY_DATABASE_URI'] = database_url
    app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
    app.config['SESSION_COOKIE_HTTPONLY'] = True
    app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
    app.config['SESSION_COOKIE_SECURE'] = environment == 'production'

    if test_config:
        app.config.update(test_config)

    db = SQLAlchemy(app)

    class User(db.Model):
        __tablename__ = 'users'

        id = db.Column(db.Integer, primary_key=True)
        name = db.Column(db.String(100), nullable=False)
        email = db.Column(db.String(255), unique=True, nullable=False)
        password_hash = db.Column(db.String(255), nullable=False)
        def set_password(self, password: str):
            self.password_hash = generate_password_hash(password)

        def check_password(self, password: str) -> bool:
            return check_password_hash(self.password_hash, password)

    with app.app_context():
        db.create_all()

    @app.get('/api/health')
    def health():
        return jsonify({'status': 'ok', 'service': 'knowyou'})

    @app.post('/api/signup')
    def signup():
        payload = request.get_json(silent=True) or {}
        name = (payload.get('name') or '').strip()
        email = (payload.get('email') or '').strip().lower()
        password = payload.get('password') or ''

        if not name or not email or not password:
            return jsonify({'error': 'Name, email and password are required.'}), 400

        if User.query.filter_by(email=email).first():
            return jsonify({'error': 'User already exists.'}), 409

        user = User(name=name, email=email)
        user.set_password(password)
        db.session.add(user)
        db.session.commit()

        session['user_id'] = user.id
        return jsonify({'success': True, 'user': {'name': user.name, 'email': user.email}})

    @app.post('/api/login')
    def login():
        payload = request.get_json(silent=True) or {}
        email = (payload.get('email') or '').strip().lower()
        password = payload.get('password') or ''

        if not email or not password:
            return jsonify({'error': 'Email and password are required.'}), 400

        user = User.query.filter_by(email=email).first()
        if not user or not user.check_password(password):
            return jsonify({'error': 'Invalid email or password.'}), 401

        session['user_id'] = user.id
        return jsonify({'success': True, 'user': {'name': user.name, 'email': user.email}})

    @app.get('/api/me')
    def get_current_user():
        user_id = session.get('user_id')
        if not user_id:
            return jsonify({'error': 'Not authenticated.'}), 401

        user = db.session.get(User, user_id)
        if not user:
            return jsonify({'error': 'User not found.'}), 404

        return jsonify({'user': {'name': user.name, 'email': user.email}})

    @app.post('/api/logout')
    def logout():
        session.pop('user_id', None)
        return jsonify({'success': True})

    @app.route('/')
    def serve_index():
        return render_template('index.html')

    @app.route('/<page>.html')
    def serve_page(page):
        allowed_pages = {'index', 'signup', 'dashboard', 'journals', 'diary', 'gratitude', 'goals', 'analysis'}
        if page not in allowed_pages:
            return send_from_directory('.', f'{page}.html')
        return render_template(f'{page}.html')

    @app.route('/<path:filename>')
    def serve_static(filename):
        return send_from_directory('.', filename)

    return app


app = create_app()


if __name__ == '__main__':
    app.run(
        host='0.0.0.0',
        port=int(os.getenv('PORT', '5000')),
        debug=False,
    )
