from app import create_app


def test_health_endpoint():
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
    })
    client = app.test_client()
    response = client.get('/api/health')
    assert response.status_code == 200
    payload = response.get_json()
    assert payload['status'] == 'ok'


def test_home_page_serves_html():
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
    })
    client = app.test_client()
    response = client.get('/')
    assert response.status_code == 200
    assert b'<!doctype html>' in response.data.lower()


def test_signup_and_login_flow():
    app = create_app({
        'TESTING': True,
        'SQLALCHEMY_DATABASE_URI': 'sqlite:///:memory:',
    })
    client = app.test_client()

    signup_response = client.post(
        '/api/signup',
        json={'name': 'Alice', 'email': 'alice@example.com', 'password': 'secret123'},
    )
    assert signup_response.status_code == 200
    assert signup_response.get_json()['user']['email'] == 'alice@example.com'

    login_response = client.post(
        '/api/login',
        json={'email': 'alice@example.com', 'password': 'secret123'},
    )
    assert login_response.status_code == 200
    assert login_response.get_json()['user']['name'] == 'Alice'

    me_response = client.get('/api/me')
    assert me_response.status_code == 200
    assert me_response.get_json()['user']['email'] == 'alice@example.com'
