from flask import Flask, render_template, request, jsonify, session, redirect
from flask_cors import CORS
from werkzeug.security import check_password_hash, generate_password_hash
import sqlite3
import json
import os
import re
import random
from functools import wraps


app = Flask(__name__,static_url_path='/app/static')
app.secret_key = 'vocab-test-secret-key-change-in-production'
CORS(app)

# Database configuration
DB_PATH = '../users.db3'
TESTS_DATA_DIR = '../tests_data'


def is_valid_test_name(name):
    """Reject path traversal and unsafe filenames (user input must not reach fs unsanitized)."""
    if not name or not isinstance(name, str):
        return False
    return bool(re.fullmatch(r'[A-Za-z0-9_]+', name))


def test_json_path(test_name):
    if not is_valid_test_name(test_name):
        return None
    return os.path.join(TESTS_DATA_DIR, f'{test_name}.json')


def natural_sort_key(label):
    """Sort labels alphanumerically (e.g. 'Test L2' before 'Test L11')."""
    if not label:
        return ()
    s = str(label).lower()
    parts = re.split(r'(\d+)', s)
    return tuple(int(p) if p.isdigit() else p for p in parts)

# Initialize database
def init_db():
    """Create users and test_scores tables if they don't exist"""
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS users (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            username TEXT UNIQUE NOT NULL,
            password TEXT NOT NULL,
            role TEXT DEFAULT 'user',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    ''')
    
    # Check if role column exists, if not add it (for existing databases)
    cursor.execute("PRAGMA table_info(users)")
    columns = [column[1] for column in cursor.fetchall()]
    if 'role' not in columns:
        cursor.execute('ALTER TABLE users ADD COLUMN role TEXT DEFAULT "user"')
    
    # Create test_scores table
    cursor.execute('''
        CREATE TABLE IF NOT EXISTS test_scores (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id INTEGER NOT NULL,
            test_name TEXT NOT NULL,
            score REAL NOT NULL,
            correct INTEGER NOT NULL,
            total INTEGER NOT NULL,
            weight REAL DEFAULT 1,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id)
        )
    ''')

    cursor.execute('''
        CREATE TABLE IF NOT EXISTS config (
            key TEXT PRIMARY KEY,
            value TEXT NOT NULL
        )
    ''')
    
    conn.commit()
    conn.close()

def login_required(f):
    """Decorator to require login"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Login required'}), 401
        return f(*args, **kwargs)
    return decorated_function

def admin_required(f):
    """Decorator to require admin role"""
    @wraps(f)
    def decorated_function(*args, **kwargs):
        if 'user_id' not in session:
            return jsonify({'error': 'Login required'}), 401
        
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT role FROM users WHERE id = ?', (session['user_id'],))
        user = cursor.fetchone()
        conn.close()
        
        if not user or user[0] != 'admin':
            return jsonify({'error': 'Admin access required'}), 403
        
        return f(*args, **kwargs)
    return decorated_function

@app.route('/')
def root_redirect():
    return redirect('/app/')

@app.route('/app/')
def index():
    """Main page"""
    return render_template('index.html')

@app.route('/app/admin')
def admin():
    """Admin page"""
    return render_template('admin.html')

@app.route('/app/flashcards')
@login_required
def flashcards():
    """Flashcards practice page"""
    return render_template('flashcards.html')

@app.route('/app/api/register', methods=['POST'])
def register():
    """Register a new user"""
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()


        
        # Get list of existing users to determine if this is the first user being registered
        cursor.execute('SELECT COUNT(*) FROM users')
        user_count = cursor.fetchone()[0]

        
        if user_count == 0:
            role = 'admin'
        else:
            role = 'user'


        cursor.execute('SELECT key, value FROM config WHERE key = "registration_enabled"')
        registration_enabled = cursor.fetchone()

        # Allow registration if there are no users or if registration is enabled in config
        if user_count == 0 or (registration_enabled and registration_enabled[1] == 'true'):
            hashed_password = generate_password_hash(password)
            cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                        (username, hashed_password, role))
            conn.commit()
            conn.close()
        else:
            conn.close()
            return jsonify({'error': 'Registration is currently disabled'}), 403
        return jsonify({'message': 'User registered successfully'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400

@app.route('/app/api/login', methods=['POST'])
def login():
    """Login user"""
    data = request.json
    username = data.get('username', '').strip().lower()
    password = data.get('password', '').strip()
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    conn = sqlite3.connect(DB_PATH)
    cursor = conn.cursor()
    cursor.execute('SELECT id, password, role FROM users WHERE username = ?', (username,))
    user = cursor.fetchone()
    conn.close()
    
    if user and check_password_hash(user[1], password):
        session['user_id'] = user[0]
        session['username'] = username
        session['role'] = user[2]
        return jsonify({'message': 'Login successful', 'username': username, 'role': user[2]}), 200
    else:
        return jsonify({'error': 'Invalid username or password'}), 401

@app.route('/app/api/logout', methods=['POST'])
def logout():
    """Logout user"""
    session.clear()
    return jsonify({'message': 'Logged out successfully'}), 200

@app.route('/app/api/user', methods=['GET'])
@login_required
def get_user():
    """Get current user info"""
    return jsonify({
        'user_id': session['user_id'],
        'username': session['username'],
        'role': session.get('role', 'user')
    }), 200

@app.route('/app/api/tests', methods=['GET'])
@login_required
def get_tests_list():
    """Get list of tests. Admins see all with enabled flag; users only enabled tests."""
    tests = []
    role = session.get('role', 'user')
    is_admin = role == 'admin'
    if os.path.exists(TESTS_DATA_DIR):
        for filename in os.listdir(TESTS_DATA_DIR):
            if not filename.endswith('.json'):
                continue
            test_name = filename[:-5]
            if not is_valid_test_name(test_name):
                continue
            filepath = os.path.join(TESTS_DATA_DIR, filename)
            try:
                with open(filepath, 'r', encoding='utf-8') as f:
                    test_data = json.load(f)
            except (OSError, json.JSONDecodeError):
                continue
            enabled = bool(test_data.get('enabled', True))
            if not is_admin and not enabled:
                continue
            title = (test_data.get('title') or test_name).strip() or test_name
            entry = {
                'name': test_name,
                'file': filename,
                'title': title,
            }
            if is_admin:
                entry['enabled'] = enabled
            tests.append(entry)
    tests.sort(key=lambda t: natural_sort_key(t.get('title') or t['name']))
    return jsonify({'tests': tests}), 200

@app.route('/app/api/tests/<test_name>', methods=['GET'])
@login_required
def get_test(test_name):
    """Get specific test data"""
    test_file = test_json_path(test_name)
    if not test_file or not os.path.exists(test_file):
        return jsonify({'error': 'Test not found'}), 404
    
    try:
        with open(test_file, 'r', encoding='utf-8') as f:
            test_data = json.load(f)
        if session.get('role', 'user') != 'admin' and not bool(test_data.get('enabled', True)):
            return jsonify({'error': 'Test not found'}), 404

        flashcards_mode = request.args.get('flashcards') == 'true'
        questions = test_data.get('questions', [])
        max_questions = test_data.get('max_questions')

        if not flashcards_mode and isinstance(max_questions, int) and max_questions > 0 and len(questions) > max_questions:
            selected_questions = random.sample(questions, max_questions)
            returned_test = {
                'title': test_data.get('title'),
                'description': test_data.get('description'),
                'weight': test_data.get('weight'),
                'enabled': test_data.get('enabled'),
                'record_score': test_data.get('record_score'),
                'max_questions': max_questions,
                'questions': selected_questions
            }
            active_questions = session.get('active_test_questions', {})
            active_questions[test_name] = selected_questions
            session['active_test_questions'] = active_questions
            return jsonify(returned_test), 200

        active_questions = session.get('active_test_questions', {})
        active_questions[test_name] = questions
        session['active_test_questions'] = active_questions
        return jsonify(test_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/tests/<test_name>/submit', methods=['POST'])
@login_required
def submit_test(test_name):
    """Submit test results and record score"""
    data = request.json
    answers = data.get('answers', [])
    
    test_file = test_json_path(test_name)
    if not test_file or not os.path.exists(test_file):
        return jsonify({'error': 'Test not found'}), 404
    
    try:
        with open(test_file, 'r', encoding='utf-8') as f:
            test_data = json.load(f)
        if session.get('role', 'user') != 'admin' and not bool(test_data.get('enabled', True)):
            return jsonify({'error': 'Test not found'}), 404

        active_questions = session.get('active_test_questions', {}).get(test_name)
        questions = active_questions if isinstance(active_questions, list) else test_data.get('questions', [])

        # Calculate score for multiple choice
        correct = 0
        total = len(questions)
        answers_detail = []
        
        for i, question in enumerate(questions):
            user_answer = answers[i] if i < len(answers) else ''
            correct_answer = question.get('correct_answer', '')
            is_correct = user_answer == correct_answer
            
            if is_correct:
                correct += 1
            
            answers_detail.append({
                'question_number': i + 1,
                'arabic_word': question.get('arabic_word', ''),
                'user_answer': user_answer,
                'correct_answer': correct_answer,
                'is_correct': is_correct
            })
        
        score = (correct / total * 100) if total > 0 else 0

        # Persist score only when the test opts in (record_score: true in JSON)
        if test_data.get('record_score') is True:
            conn = sqlite3.connect(DB_PATH)
            cursor = conn.cursor()
            cursor.execute('''
                SELECT id FROM test_scores WHERE user_id = ? AND test_name = ?
            ''', (session['user_id'], test_name))
            existing_score = cursor.fetchone()

            cursor.execute('SELECT key FROM config WHERE key = "retake_allowed"')
            retake_allowed = cursor.fetchone()

            if existing_score:
                # Update existing score
                if retake_allowed and retake_allowed[0] == 'true':
                    cursor.execute('''
                        UPDATE test_scores SET score = ?, correct = ?, total = ?, weight = ?, created_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                    ''', (score, correct, total, test_data['weight'], existing_score[0]))

            else:
                # Insert new score
                cursor.execute('''
                    INSERT INTO test_scores (user_id, test_name, score, correct, total, weight)
                    VALUES (?, ?, ?, ?, ?, ?)
                ''', (session['user_id'], test_name, score, correct, total, test_data['weight']))

            conn.commit()
            conn.close()
        
        return jsonify({
            'score': score,
            'correct': correct,
            'total': total,
            'percentage': f'{score:.2f}%',
            'answers': answers_detail
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/tests', methods=['POST'])
@admin_required
def create_test():
    """Create a new test"""
    data = request.json
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    weight = data.get('weight', 1)
    questions = data.get('questions', [])
    
    if not title:
        return jsonify({'error': 'Title required'}), 400
    
    if not questions or len(questions) == 0:
        return jsonify({'error': 'At least one question required'}), 400
    
    # Create filename from title (remove special chars, lowercase, replace spaces with underscores)
    filename = title.lower().replace(' ', '_')
    filename = ''.join(c for c in filename if c.isalnum() or c == '_')
    test_file = os.path.join(TESTS_DATA_DIR, f'{filename}.json')
    
    # Avoid overwriting existing files
    if os.path.exists(test_file):
        return jsonify({'error': 'A test with this name already exists'}), 400
    
    try:
        # Ensure tests_data directory exists
        if not os.path.exists(TESTS_DATA_DIR):
            os.makedirs(TESTS_DATA_DIR)
        
        enabled = True
        if 'enabled' in data:
            if not isinstance(data['enabled'], bool):
                return jsonify({'error': 'enabled must be a boolean'}), 400
            enabled = data['enabled']

        record_score = False
        if 'record_score' in data:
            if not isinstance(data['record_score'], bool):
                return jsonify({'error': 'record_score must be a boolean'}), 400
            record_score = data['record_score']

        max_questions = None
        if 'max_questions' in data:
            if not isinstance(data['max_questions'], int) or data['max_questions'] < 1:
                return jsonify({'error': 'max_questions must be a positive integer'}), 400
            max_questions = data['max_questions']

        test_data = {
            'title': title,
            'description': description,
            'weight': weight,
            'enabled': enabled,
            'record_score': record_score,
            'questions': questions
        }
        if max_questions is not None:
            test_data['max_questions'] = max_questions
        
        with open(test_file, 'w', encoding='utf-8') as f:
            json.dump(test_data, f, ensure_ascii=False, indent=4)
        
        return jsonify({
            'message': 'Test created successfully',
            'test_name': filename
        }), 201
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/tests/<test_name>', methods=['GET'])
@admin_required
def get_admin_test(test_name):
    """Get test data for editing (admin only)"""
    test_file = test_json_path(test_name)
    if not test_file or not os.path.exists(test_file):
        return jsonify({'error': 'Test not found'}), 404
    
    try:
        with open(test_file, 'r', encoding='utf-8') as f:
            test_data = json.load(f)
        return jsonify(test_data), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/tests/<test_name>', methods=['PUT'])
@admin_required
def update_test(test_name):
    """Update an existing test (admin only)"""
    data = request.json
    title = data.get('title', '').strip()
    description = data.get('description', '').strip()
    weight = data.get('weight', 1)
    questions = data.get('questions', [])
    
    if not title:
        return jsonify({'error': 'Title required'}), 400
    
    if not questions or len(questions) == 0:
        return jsonify({'error': 'At least one question required'}), 400
    
    test_file = test_json_path(test_name)
    if not test_file or not os.path.exists(test_file):
        return jsonify({'error': 'Test not found'}), 404
    
    try:
        with open(test_file, 'r', encoding='utf-8') as f:
            existing_data = json.load(f)
        prev_enabled = bool(existing_data.get('enabled', True))
        if 'enabled' in data:
            if not isinstance(data['enabled'], bool):
                return jsonify({'error': 'enabled must be a boolean'}), 400
            enabled = data['enabled']
        else:
            enabled = prev_enabled

        prev_record_score = bool(existing_data.get('record_score', False))
        if 'record_score' in data:
            if not isinstance(data['record_score'], bool):
                return jsonify({'error': 'record_score must be a boolean'}), 400
            record_score = data['record_score']
        else:
            record_score = prev_record_score

        prev_max_questions = existing_data.get('max_questions')
        if 'max_questions' in data:
            if not isinstance(data['max_questions'], int) or data['max_questions'] < 1:
                return jsonify({'error': 'max_questions must be a positive integer'}), 400
            max_questions = data['max_questions']
        else:
            max_questions = prev_max_questions

        test_data = {
            'title': title,
            'description': description,
            'weight': weight,
            'enabled': enabled,
            'record_score': record_score,
            'questions': questions
        }
        if max_questions is not None:
            test_data['max_questions'] = max_questions

        with open(test_file, 'w', encoding='utf-8') as f:
            json.dump(test_data, f, ensure_ascii=False, indent=4)

        return jsonify({
            'message': 'Test updated successfully',
            'test_name': test_name
        }), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/tests/<test_name>/enabled', methods=['PATCH'])
@admin_required
def set_test_enabled(test_name):
    """Enable or disable a test for regular users (admin only)."""
    test_file = test_json_path(test_name)
    if not test_file or not os.path.exists(test_file):
        return jsonify({'error': 'Test not found'}), 404
    body = request.json or {}
    if 'enabled' not in body or not isinstance(body['enabled'], bool):
        return jsonify({'error': 'JSON body must include boolean "enabled"'}), 400
    try:
        with open(test_file, 'r', encoding='utf-8') as f:
            test_data = json.load(f)
        test_data['enabled'] = body['enabled']
        with open(test_file, 'w', encoding='utf-8') as f:
            json.dump(test_data, f, ensure_ascii=False, indent=4)
        return jsonify({'message': 'Test visibility updated', 'enabled': body['enabled']}), 200
    except (OSError, json.JSONDecodeError) as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/tests/<test_name>', methods=['DELETE'])
@admin_required
def delete_test(test_name):
    """Delete a test (admin only)"""
    test_file = test_json_path(test_name)
    if not test_file or not os.path.exists(test_file):
        return jsonify({'error': 'Test not found'}), 404
    
    try:
        os.remove(test_file)
        return jsonify({'message': 'Test deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/users', methods=['POST'])
@admin_required
def create_user():
    """Create a new user (admin only)"""
    data = request.json
    username = data.get('username', '').strip()
    password = data.get('password', '').strip()
    role = data.get('role', 'user')
    
    if not username or not password:
        return jsonify({'error': 'Username and password required'}), 400
    
    if len(password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400
    
    if role not in ['user', 'admin']:
        return jsonify({'error': 'Role must be user or admin'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        hashed_password = generate_password_hash(password)
        cursor.execute('INSERT INTO users (username, password, role) VALUES (?, ?, ?)',
                      (username, hashed_password, role))
        conn.commit()
        conn.close()
        return jsonify({'message': 'User created successfully'}), 201
    except sqlite3.IntegrityError:
        return jsonify({'error': 'Username already exists'}), 400
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/users', methods=['GET'])
@admin_required
def list_users():
    """List all users (admin only)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT id, username, role, created_at FROM users ORDER BY created_at DESC')
        users = cursor.fetchall()
        conn.close()
        
        user_list = []
        for user in users:
            user_list.append({
                'id': user[0],
                'username': user[1],
                'role': user[2],
                'created_at': user[3]
            })
        
        return jsonify({'users': user_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/users/<int:user_id>', methods=['PUT'])
@admin_required
def update_user(user_id):
    """Update an existing user (admin only)"""
    data = request.json
    password = data.get('password', '').strip()
    role = data.get('role', 'user')
    update_password = data.get('update_password', False)
    
    # Password is only required if we're updating it
    if update_password:
        if not password or len(password) < 4:
            return jsonify({'error': 'Password must be at least 4 characters'}), 400
    
    if role not in ['user', 'admin']:
        return jsonify({'error': 'Role must be user or admin'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute('SELECT id FROM users WHERE id = ?', (user_id,))
        if not cursor.fetchone():
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        # Update role and password (if provided)
        if update_password:
            hashed_password = generate_password_hash(password)
            cursor.execute('UPDATE users SET password = ?, role = ? WHERE id = ?',
                          (hashed_password, role, user_id))
        else:
            cursor.execute('UPDATE users SET role = ? WHERE id = ?',
                          (role, user_id))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'User updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/users/<int:user_id>', methods=['DELETE'])
@admin_required
def delete_user(user_id):
    """Delete a user (admin only)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if user exists
        cursor.execute('SELECT username FROM users WHERE id = ?', (user_id,))
        user = cursor.fetchone()
        if not user:
            conn.close()
            return jsonify({'error': 'User not found'}), 404
        
        cursor.execute('DELETE FROM users WHERE id = ?', (user_id,))
        conn.commit()
        conn.close()
        
        return jsonify({'message': f'User {user[0]} deleted successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/scores', methods=['GET'])
@login_required
def get_user_scores():
    """Get test scores for the current user"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT id, test_name, score, correct, total, created_at 
            FROM test_scores 
            WHERE user_id = ? 
            ORDER BY created_at DESC
        ''', (session['user_id'],))
        scores = cursor.fetchall()
        conn.close()
        
        score_list = []
        for score in scores:
            # Load test data to get weight
            test_file = os.path.join(TESTS_DATA_DIR, f'{score[1]}.json')
            weight = 1
            if os.path.exists(test_file):
                try:
                    with open(test_file, 'r', encoding='utf-8') as f:
                        test_data = json.load(f)
                        weight = test_data.get('weight', 1)
                except:
                    weight = 1
            
            score_list.append({
                'id': score[0],
                'test_name': score[1],
                'score': score[2],
                'correct': score[3],
                'total': score[4],
                'created_at': score[5],
                'weight': weight
            })
        
        return jsonify({'scores': score_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/scores', methods=['GET'])
@admin_required
def get_all_scores():
    """Get all test scores for all users (admin only)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT ts.id, u.username, ts.test_name, ts.score, ts.correct, ts.total, ts.created_at
            FROM test_scores ts
            JOIN users u ON ts.user_id = u.id
            ORDER BY ts.created_at DESC
        ''')
        scores = cursor.fetchall()
        conn.close()
        
        score_list = []
        for score in scores:
            # Load test data to get weight
            test_file = os.path.join(TESTS_DATA_DIR, f'{score[2]}.json')
            weight = 1
            if os.path.exists(test_file):
                try:
                    with open(test_file, 'r', encoding='utf-8') as f:
                        test_data = json.load(f)
                        weight = test_data.get('weight', 1)
                except:
                    weight = 1
            
            score_list.append({
                'id': score[0],
                'username': score[1],
                'test_name': score[2],
                'score': score[3],
                'correct': score[4],
                'total': score[5],
                'created_at': score[6],
                'weight': weight
            })
        
        return jsonify({'scores': score_list}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/completed-tests', methods=['GET'])
@login_required
def get_completed_tests():
    """Get list of tests completed by the current user"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('''
            SELECT DISTINCT test_name FROM test_scores WHERE user_id = ?
        ''', (session['user_id'],))
        tests = cursor.fetchall()
        conn.close()
        
        completed_tests = [test[0] for test in tests]
        return jsonify({'completed_tests': completed_tests}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/change-password', methods=['POST'])
@login_required
def change_password():
    """Change the current user's password"""
    data = request.json
    current_password = data.get('current_password', '').strip()
    new_password = data.get('new_password', '').strip()
    confirm_password = data.get('confirm_password', '').strip()
    
    if not current_password or not new_password or not confirm_password:
        return jsonify({'error': 'All fields are required'}), 400
    
    if new_password != confirm_password:
        return jsonify({'error': 'New passwords do not match'}), 400
    
    if len(new_password) < 4:
        return jsonify({'error': 'Password must be at least 4 characters'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Get user's current password hash
        cursor.execute('SELECT password FROM users WHERE id = ?', (session['user_id'],))
        user = cursor.fetchone()
        
        if not user or not check_password_hash(user[0], current_password):
            conn.close()
            return jsonify({'error': 'Current password is incorrect'}), 401
        
        # Update password
        hashed_password = generate_password_hash(new_password)
        cursor.execute('UPDATE users SET password = ? WHERE id = ?', (hashed_password, session['user_id']))
        conn.commit()
        conn.close()
        
        return jsonify({'message': 'Password changed successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/config', methods=['GET'])
@admin_required
def get_config():
    """Get all configuration settings (admin only)"""
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        cursor.execute('SELECT key, value FROM config')
        configs = cursor.fetchall()
        conn.close()
        
        config_dict = {
            'registration_enabled': 'false',  # default
            'retake_allowed': 'false'  # default
        }
        
        for config in configs:
            config_dict[config[0]] = config[1]
        
        return jsonify({'config': config_dict}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/app/api/admin/config', methods=['POST'])
@admin_required
def set_config():
    """Set a configuration setting (admin only)"""
    data = request.json
    key = data.get('key', '').strip()
    value = data.get('value', '').strip()
    
    if not key or value == '':
        return jsonify({'error': 'Key and value are required'}), 400
    
    # Validate allowed keys
    allowed_keys = ['registration_enabled', 'retake_allowed']
    if key not in allowed_keys:
        return jsonify({'error': 'Invalid configuration key'}), 400
    
    try:
        conn = sqlite3.connect(DB_PATH)
        cursor = conn.cursor()
        
        # Check if key exists
        cursor.execute('SELECT key FROM config WHERE key = ?', (key,))
        existing = cursor.fetchone()
        
        if existing:
            # Update existing
            cursor.execute('UPDATE config SET value = ? WHERE key = ?', (value, key))
        else:
            # Insert new
            cursor.execute('INSERT INTO config (key, value) VALUES (?, ?)', (key, value))
        
        conn.commit()
        conn.close()
        
        return jsonify({'message': f'Configuration "{key}" updated successfully'}), 200
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    init_db()
    app.run(debug=True, port=5000)
