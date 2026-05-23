// API endpoints
const API_BASE = '/app/api';

// Application state
let currentUser = null;
let currentTest = null;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    checkAuth();
    setupEventListeners();
});

function setupEventListeners() {
    const testForm = document.getElementById('test-form');
    if (testForm) {
        testForm.addEventListener('submit', submitTest);
    }
    
    const authForm = document.getElementById('auth-form');
    if (authForm) {
        authForm.addEventListener('submit', function(event) {
            event.preventDefault();
            login();
        });
    }
}

async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/user`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            currentUser = data;
            showAppSection();
            loadTests();
        } else {
            showAuthSection();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthSection();
    }
}

function showAuthSection() {
    document.getElementById('auth-section').style.display = 'block';
    document.getElementById('app-section').style.display = 'none';
    document.getElementById('user-info').style.display = 'none';
}

function showAppSection() {
    document.getElementById('auth-section').style.display = 'none';
    document.getElementById('app-section').style.display = 'block';
    document.getElementById('user-info').style.display = 'flex';
    document.getElementById('username-display').textContent = `${currentUser.username}`;
    
    // Show admin button only for admin users
    const adminBtn = document.querySelector('.btn-admin');
    if (adminBtn) {
        adminBtn.style.display = 'inline-block';
        adminBtn.style.display = currentUser.role === 'admin' ? 'inline-block' : 'none';
    }
}

async function register() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const messageDiv = document.getElementById('auth-message');
    
    if (!username || !password) {
        showMessage('Please fill in all fields', 'error', messageDiv);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Registration successful! You can now login.', 'success', messageDiv);
            document.getElementById('auth-form').reset();
        } else {
            showMessage(data.error || 'Registration failed', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Registration error:', error);
        showMessage('Registration failed', 'error', messageDiv);
    }
}

async function login() {
    const username = document.getElementById('username').value.trim();
    const password = document.getElementById('password').value.trim();
    const messageDiv = document.getElementById('auth-message');
    
    if (!username || !password) {
        showMessage('Please fill in all fields', 'error', messageDiv);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            currentUser = { username: data.username, role: data.role };
            showMessage('Login successful!', 'success', messageDiv);
            document.getElementById('auth-form').reset();
            setTimeout(() => {
                showAppSection();
                loadTests();
            }, 500);
        } else {
            showMessage(data.error || 'Login failed', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed', 'error', messageDiv);
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        
        currentUser = null;
        showAuthSection();
        document.getElementById('auth-form').reset();
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function loadTests() {
    try {
        const [testsResponse, completedResponse] = await Promise.all([
            fetch(`${API_BASE}/tests`, { credentials: 'include' }),
            fetch(`${API_BASE}/completed-tests`, { credentials: 'include' })
        ]);
        
        if (testsResponse.ok && completedResponse.ok) {
            const testsData = await testsResponse.json();
            const completedData = await completedResponse.json();
            displayTests(testsData.tests, completedData.completed_tests);
        } else if (testsResponse.ok) {
            const testsData = await testsResponse.json();
            displayTests(testsData.tests, []);
        }
    } catch (error) {
        console.error('Failed to load tests:', error);
    }
}

function displayTests(tests, completedTests = []) {
    const testsList = document.getElementById('tests-list');
    testsList.innerHTML = '';
    
    if (tests.length === 0) {
        const empty = document.createElement('p');
        empty.className = 'tests-empty-msg';
        empty.textContent = 'No tests available yet.';
        testsList.appendChild(empty);
        return;
    }

    const table = document.createElement('table');
    table.className = 'scores-table tests-available-table';
    const thead = document.createElement('thead');
    thead.innerHTML =
        '<tr><th>Test</th><th></th><th></th></tr>';
    table.appendChild(thead);
    const tbody = document.createElement('tbody');

    tests.forEach(test => {
        const isCompleted = completedTests.includes(test.name);
        const row = document.createElement('tr');
        row.className = isCompleted ? 'test-row completed' : 'test-row';

        const titleCell = document.createElement('td');
        const strong = document.createElement('strong');
        strong.textContent = test.title || test.name;
        titleCell.appendChild(strong);
        const sub = document.createElement('div');
        sub.className = 'test-row-slug';
        sub.textContent = test.name;
        titleCell.appendChild(sub);

        const statusCell = document.createElement('td');
        if (isCompleted) {
            const badge = document.createElement('span');
            badge.className = 'completed-badge';
            badge.textContent = '✓';
            statusCell.appendChild(badge);
        } else {
            statusCell.textContent = '';
        }

        const actionCell = document.createElement('td');
        actionCell.className = 'tests-table-actions';
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-primary btn-small';
        btn.textContent = 'Start';
        btn.addEventListener('click', () => selectTest(test.name));
        actionCell.appendChild(btn);

        row.appendChild(titleCell);
        row.appendChild(statusCell);
        row.appendChild(actionCell);
        tbody.appendChild(row);
    });

    table.appendChild(tbody);
    testsList.appendChild(table);
}

async function selectTest(testName) {
    try {
        const response = await fetch(`${API_BASE}/tests/${testName}`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const testData = await response.json();
            currentTest = { name: testName, data: testData };
            displayTest(testData);
            
            // Switch to test view
            document.getElementById('tests-list-view').style.display = 'none';
            document.getElementById('test-view').style.display = 'block';
            document.getElementById('results-view').style.display = 'none';
        }
    } catch (error) {
        console.error('Failed to load test:', error);
    }
}

function displayTest(testData) {
    document.getElementById('test-title').textContent = testData.title || 'Test';

    const container = document.getElementById('questions-container');
    container.innerHTML = '';

    const requireAllAnswers = testData.record_score === true;

    testData.questions.forEach((question, index) => {
        const div = document.createElement('div');
        div.className = 'question-block';

        let optionsHtml = '';
        const rawOptions = Array.isArray(question.options) ? question.options.slice() : [];
        const correctAnswer = question.correct_answer || '';

        if (correctAnswer && !rawOptions.includes(correctAnswer)) {
            rawOptions.push(correctAnswer);
        }

        const uniqueOptions = [...new Set(rawOptions.filter(opt => opt !== null && opt !== undefined && String(opt).trim() !== ''))];

        if (uniqueOptions.length > 0) {
            const requiredAttr = requireAllAnswers ? ' required' : '';
            optionsHtml = uniqueOptions.map(option => `
                <label class="option-label">
                    <input type="radio" name="answer-${index}" value="${option}"${requiredAttr}>
                    <span>${option}</span>
                </label>
            `).join('');
        }
        
        div.innerHTML = `
            <label>Question ${index + 1}</label>
            <p style="font-size: 2.3em; color: #667eea; margin: 15px 0;">${question.arabic_word}</p>
            <div class="options-group">
                ${optionsHtml}
            </div>
        `;
        container.appendChild(div);
    });
}

async function submitTest(e) {
    e.preventDefault();
    
    if (!currentTest) return;
    
    const answers = [];
    currentTest.data.questions.forEach((_, index) => {
        const selected = document.querySelector(`input[name="answer-${index}"]:checked`);
        answers.push(selected ? selected.value : '');
    });
    
    try {
        const response = await fetch(`${API_BASE}/tests/${currentTest.name}/submit`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ answers })
        });
        
        if (response.ok) {
            const results = await response.json();
            displayResults(results);
            
            // Switch to results view
            document.getElementById('test-view').style.display = 'none';
            document.getElementById('results-view').style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to submit test:', error);
    }
}

function displayResults(results) {
    document.getElementById('result-percentage').textContent = results.percentage;
    document.getElementById('result-correct').textContent = results.correct;
    document.getElementById('result-total').textContent = results.total;
    
    // Display detailed answer breakdown
    if (results.answers && results.answers.length > 0) {
        const container = document.getElementById('answers-breakdown');
        container.innerHTML = '';
        
        results.answers.forEach(answer => {
            const div = document.createElement('div');
            div.className = `answer-item ${answer.is_correct ? 'correct' : 'incorrect'}`;
            
            const statusIcon = answer.is_correct ? '✓' : '✗';
            const statusText = answer.is_correct ? 'Correct' : 'Incorrect';
            
            div.innerHTML = `
                <div class="answer-header">
                    <span class="status-badge ${answer.is_correct ? 'badge-correct' : 'badge-incorrect'}">${statusIcon}</span>
                    <div class="answer-question">
                        <strong>Question ${answer.question_number}:</strong> ${answer.arabic_word}
                    </div>
                </div>
                <div class="answer-body">
                    <div class="answer-row">
                        <span class="answer-label">Your answer:</span>
                        <span class="answer-value ${answer.is_correct ? 'correct-text' : 'incorrect-text'}">${answer.user_answer || '(blank)'}</span>
                    </div>
                    ${!answer.is_correct ? `<div class="answer-row">
                        <span class="answer-label">Correct answer:</span>
                        <span class="answer-value correct-text">${answer.correct_answer}</span>
                    </div>` : ''}
                </div>
            `;
            container.appendChild(div);
        });
    }
}

function backToTests() {
    document.getElementById('tests-list-view').style.display = 'block';
    document.getElementById('test-view').style.display = 'none';
    document.getElementById('results-view').style.display = 'none';
}

function switchUserTab(tabName) {
    // Hide all tabs
    document.getElementById('tests-tab').style.display = 'none';
    document.getElementById('scores-tab').style.display = 'none';
    document.getElementById('profile-tab').style.display = 'none';
    
    // Remove active class from all buttons
    document.getElementById('tab-tests').classList.remove('active');
    document.getElementById('tab-scores').classList.remove('active');
    document.getElementById('tab-profile').classList.remove('active');
    
    // Show selected tab and activate button
    if (tabName === 'tests') {
        document.getElementById('tests-tab').style.display = 'block';
        document.getElementById('tab-tests').classList.add('active');
    } else if (tabName === 'scores') {
        document.getElementById('scores-tab').style.display = 'block';
        document.getElementById('tab-scores').classList.add('active');
        loadUserScores();
    } else if (tabName === 'profile') {
        document.getElementById('profile-tab').style.display = 'block';
        document.getElementById('tab-profile').classList.add('active');
    }
}

async function loadUserScores() {
    try {
        const response = await fetch(`${API_BASE}/scores`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            displayUserScores(data.scores);
        }
    } catch (error) {
        console.error('Failed to load scores:', error);
    }
}

function displayUserScores(scores) {
    const container = document.getElementById('scores-list');
    container.innerHTML = '';
    
    if (scores.length === 0) {
        container.innerHTML = '<p style="text-align: center; padding: 20px;">No scores recorded yet.</p>';
        return;
    }
    
    // Calculate weighted average
    let totalWeightedScore = 0;
    let totalWeight = 0;
    scores.forEach(score => {
        const weight = score.weight || 1;
        totalWeightedScore += score.score * weight;
        totalWeight += weight;
    });
    const weightedAverage = totalWeightedScore / totalWeight;
    const avgColor = weightedAverage >= 70 ? '#4caf50' : weightedAverage >= 50 ? '#ff9800' : '#f44336';
    
    // Create weighted average summary
    let html = `
        <div style="margin-bottom: 30px; padding: 20px; background-color: #f5f5f5; border-radius: 8px;">
            <h3 style="margin-top: 0;">📊 Weighted Average</h3>
            <div style="display: flex; align-items: center; gap: 20px;">
                <div style="text-align: center;">
                    <div style="font-size: 48px; color: ${avgColor}; font-weight: bold;">${weightedAverage.toFixed(2)}%</div>
                    <div style="font-size: 14px; color: #666; margin-top: 5px;">Overall Score</div>
                </div>
                <div style="flex: 1; padding: 10px; background: white; border-radius: 5px;">
                    <div style="margin-bottom: 8px;"><strong>Summary:</strong></div>
                    <div style="font-size: 14px; color: #666;">Tests Completed: <strong>${scores.length}</strong></div>
                    <div style="font-size: 14px; color: #666;">Total Weight: <strong>${totalWeight}</strong></div>
                </div>
            </div>
        </div>
    `;
    
    html += `
        <table class="scores-table">
            <thead>
                <tr>
                    <th>Test Name</th>
                    <th>Weight</th>
                    <th>Score</th>
                    <th>Correct Answers</th>
                    <th>Date</th>
                </tr>
            </thead>
            <tbody>
    `;
    
    scores.forEach(score => {
        const date = new Date(score.created_at).toLocaleDateString();
        const scoreColor = score.score >= 70 ? '#4caf50' : score.score >= 50 ? '#ff9800' : '#f44336';
        const weight = score.weight || 1;
        html += `
            <tr>
                <td>${score.test_name}</td>
                <td>${weight}</td>
                <td style="color: ${scoreColor}; font-weight: bold;">${score.score.toFixed(2)}%</td>
                <td>${score.correct}/${score.total}</td>
                <td>${date}</td>
            </tr>
        `;
    });
    
    html += `
            </tbody>
        </table>
    `;
    
    container.innerHTML = html;
}

async function changePassword() {
    const currentPassword = document.getElementById('current-password').value.trim();
    const newPassword = document.getElementById('new-password').value.trim();
    const confirmPassword = document.getElementById('confirm-password').value.trim();
    const messageDiv = document.getElementById('password-message');
    
    if (!currentPassword || !newPassword || !confirmPassword) {
        showMessage('Please fill in all fields', 'error', messageDiv);
        return;
    }
    
    if (newPassword !== confirmPassword) {
        showMessage('New passwords do not match', 'error', messageDiv);
        return;
    }
    
    if (newPassword.length < 4) {
        showMessage('Password must be at least 4 characters', 'error', messageDiv);
        return;
    }
    
    try {
        const response = await fetch(`${API_BASE}/change-password`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });
        
        const data = await response.json();
        
        if (response.ok) {
            showMessage('Password changed successfully!', 'success', messageDiv);
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-password').value = '';
        } else {
            showMessage(data.error || 'Failed to change password', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Password change error:', error);
        showMessage('Failed to change password', 'error', messageDiv);
    }
}

function showMessage(message, type, element) {
    element.textContent = message;
    element.className = `message ${type}`;
    setTimeout(() => {
        element.className = 'message';
    }, 5000);
}
