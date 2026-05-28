# Vocabulary Test App

A multi-user web application that allows users to login and take vocabulary tests with Arabic and English words.

## Features

- ✅ Multi-user login system
- ✅ User credentials stored in SQLite database (`users.db3`)
- ✅ Tests stored in JSON files
- ✅ Arabic and English word pairs
- ✅ Password hashing for security
- ✅ Responsive web interface with client-side JavaScript

## Project Structure

```
app/
├── main.py                 # Flask application & API endpoints
├── requirements.txt        # Python dependencies
├── users.db3              # SQLite database (auto-created)
├── templates/
│   └── index.html         # Main HTML template
├── static/
│   ├── app.js            # Client-side JavaScript
│   └── style.css         # Styling
└── tests_data/
    └── sample_test.json  # Sample vocabulary test
```

## Installation & Setup

1. **Clone or navigate to the project directory**
   ```bash
   cd app
   ```

2. **Create a virtual environment**
   ```bash
   python3 -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. **Install dependencies**
   ```bash
   pip install -r requirements.txt
   ```

4. **Run the application**
   ```bash
   python main.py
   ```

5. **Open in browser**
   ```
   http://localhost:5000
   ```

## Usage

1. **Register a new account** or **Login** with existing credentials
2. **Select a test** from the available tests
3. **Answer the questions** by typing the answer
4. **Submit** to see your score

## Adding More Tests

Create new JSON files in the `tests_data/` directory with the following format:

```json
{
    "title": "Test Name",
    "description": "Test description",
    "questions": [
        {
            "english_word": "Word",
            "arabic_word": "الكلمة",
            "answer": "word"
        }
    ]
}
```

## Database

The application automatically creates a `users.db3` SQLite database with a `users` table containing:
- `id`: Auto-increment user ID
- `username`: Unique username
- `password`: Hashed password
- `created_at`: Account creation timestamp

## Security Notes

- Passwords are hashed using Werkzeug's security functions
- Change the `secret_key` in `main.py` for production use
- Enable HTTPS in production
- Implement rate limiting for login attempts

## API Endpoints

- `POST /api/register` - Register a new user
- `POST /api/login` - Login user
- `POST /api/logout` - Logout user
- `GET /api/user` - Get current user info
- `GET /api/tests` - Get list of available tests
- `GET /api/tests/<test_name>` - Get test data
- `POST /api/tests/<test_name>/submit` - Submit test answers

## Technologies Used

- **Backend**: Python Flask with Flask-CORS
- **Database**: SQLite
- **Frontend**: HTML5, CSS3, JavaScript
- **Authentication**: Session-based with password hashing
