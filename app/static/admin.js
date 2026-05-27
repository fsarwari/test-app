const API_BASE = '/app/api';

let currentUser = null;
let questions = [];
let questionCounter = 0;
let editingTestName = null;
let editingUserId = null;
let passwordModified = false;

const $ = (id) => document.getElementById(id);

function isDesktopUIMode() {
    return document.body.classList.contains('desktop-app');
}

const TAB_TITLES = {
    tests: 'Tests',
    users: 'Users',
    scores: 'Scores',
    settings: 'Settings'
};

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function showMessage(message, type, element) {
    if (!element) return;
    element.textContent = message;
    element.className = `message ${type}`;
    setTimeout(() => {
        element.className = 'message';
        element.textContent = '';
    }, 5000);
}

function setTopTitle(title) {
    const el = $('top-title');
    if (el) el.textContent = title;
}

document.addEventListener('DOMContentLoaded', () => {
    $('auth-form')?.addEventListener('submit', (e) => {
        e.preventDefault();
        login();
    });
    $('btn-new-test')?.addEventListener('click', showNewTestForm);
    $('btn-close-test-form')?.addEventListener('click', hideTestFormPanel);
    $('btn-cancel-test')?.addEventListener('click', hideTestFormPanel);
    $('btn-save-test')?.addEventListener('click', saveTest);
    $('btn-add-question')?.addEventListener('click', addQuestion);
    $('btn-user-save')?.addEventListener('click', createNewUser);
    $('btn-user-cancel')?.addEventListener('click', resetUserForm);
    $('btn-save-registration')?.addEventListener('click', saveRegistrationSetting);
    $('btn-save-retake')?.addEventListener('click', saveRetakeSetting);

    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => switchTab(btn.dataset.tab));
    });

    checkAuth();
});

function switchTab(tabName) {
    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-item[data-tab]').forEach((n) => n.classList.remove('active'));

    $(`panel-${tabName}`)?.classList.add('active');
    $(`nav-${tabName}`)?.classList.add('active');
    setTopTitle(TAB_TITLES[tabName] || 'Admin');

    if (tabName === 'users') loadExistingUsers();
    else if (tabName === 'scores') loadAdminScores();
    else if (tabName === 'settings') loadSettings();
}

async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/user`, { credentials: 'include' });
        if (response.ok) {
            currentUser = await response.json();
            if (currentUser.role !== 'admin') {
                showMessage('Admin access required', 'error', $('auth-message'));
                showAuthScreen();
                return;
            }
            showAdminScreen();
            loadExistingTests();
        } else {
            showAuthScreen();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthScreen();
    }
}

function showAuthScreen() {
    $('auth-screen')?.removeAttribute('hidden');
    $('admin-screen')?.setAttribute('hidden', '');
}

function showAdminScreen() {
    $('auth-screen')?.setAttribute('hidden', '');
    $('admin-screen')?.removeAttribute('hidden');
    const chip = $('username-display');
    if (chip && currentUser) chip.textContent = currentUser.username;
    switchTab('tests');
}

async function login() {
    const username = $('username')?.value.trim();
    const password = $('password')?.value.trim();
    const messageDiv = $('auth-message');

    if (!username || !password) {
        showMessage('Please fill in all fields', 'error', messageDiv);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (response.ok) {
            currentUser = { username: data.username, role: data.role };
            if (data.role !== 'admin') {
                await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
                showMessage('Admin access required', 'error', messageDiv);
                return;
            }
            showMessage('Welcome', 'success', messageDiv);
            $('auth-form')?.reset();
            setTimeout(() => {
                showAdminScreen();
                loadExistingTests();
            }, 400);
        } else {
            showMessage(data.error || 'Login failed', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Login error:', error);
        showMessage('Login failed', 'error', messageDiv);
    }
}

function buildQuestionEditor(questionId, data = {}) {
    const div = document.createElement('div');
    div.className = 'question-editor';
    div.id = `question-${questionId}`;

    const head = document.createElement('div');
    head.className = 'q-head';
    const h4 = document.createElement('h4');
    h4.textContent = `Question ${questions.length + 1}`;
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'btn-remove';
    removeBtn.textContent = '✕';
    removeBtn.addEventListener('click', () => removeQuestion(questionId));
    head.appendChild(h4);
    head.appendChild(removeBtn);
    div.appendChild(head);

    const fields = [
        { label: 'Arabic word', cls: 'arabic-word', placeholder: 'e.g. مرحبا', value: data.arabic_word || '' },
        { label: 'Correct English', cls: 'correct-answer', placeholder: 'e.g. Hello', value: data.correct_answer || '' },
        { label: 'Options (comma separated)', cls: 'options', placeholder: 'Hello, Hi, Bye', value: data.options || '' }
    ];

    fields.forEach((f) => {
        const fg = document.createElement('div');
        fg.className = 'form-field';
        const label = document.createElement('label');
        label.textContent = f.label;
        const input = document.createElement('input');
        input.type = 'text';
        input.className = f.cls;
        input.placeholder = f.placeholder;
        input.value = f.value;
        input.required = true;
        fg.appendChild(label);
        fg.appendChild(input);
        div.appendChild(fg);
    });

    return div;
}

function addQuestion() {
    const questionId = questionCounter++;
    $('questions-list')?.appendChild(buildQuestionEditor(questionId));
    questions.push(questionId);
}

function removeQuestion(questionId) {
    $(`question-${questionId}`)?.remove();
    questions = questions.filter((id) => id !== questionId);
}

function resetTestForm() {
    if ($('test-title')) $('test-title').value = '';
    if ($('test-description')) $('test-description').value = '';
    if ($('test-weight')) $('test-weight').value = '1';
    if ($('test-max-questions')) $('test-max-questions').value = '';
    if ($('test-enabled')) $('test-enabled').checked = true;
    if ($('test-record-score')) $('test-record-score').checked = false;
    if ($('questions-list')) $('questions-list').innerHTML = '';
    if ($('test-form-title')) $('test-form-title').textContent = 'New test';
    if ($('btn-save-test')) $('btn-save-test').textContent = 'Save test';
    if ($('save-message')) $('save-message').className = 'message';
    questions = [];
    questionCounter = 0;
    editingTestName = null;
}

function openTestFormOverlay() {
    const overlay = $('test-form-overlay');
    if (!overlay) return;
    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
}

function hideTestFormPanel() {
    const overlay = $('test-form-overlay');
    if (overlay) {
        overlay.classList.remove('open');
        overlay.setAttribute('aria-hidden', 'true');
    }
    resetTestForm();
}

function showNewTestForm() {
    resetTestForm();
    openTestFormOverlay();
}

async function saveTest() {
    const title = $('test-title')?.value.trim();
    const description = $('test-description')?.value.trim();
    const weight = parseFloat($('test-weight')?.value);
    const maxQuestionsValue = $('test-max-questions')?.value.trim();
    const messageDiv = $('save-message');

    if (!title) {
        showMessage('Please enter a test title', 'error', messageDiv);
        return;
    }
    if (!questions.length) {
        showMessage('Add at least one question', 'error', messageDiv);
        return;
    }

    const questionsData = [];
    try {
        document.querySelectorAll('.question-editor').forEach((editor) => {
            const arabicWord = editor.querySelector('.arabic-word')?.value.trim();
            const correctAnswer = editor.querySelector('.correct-answer')?.value.trim();
            const optionsText = editor.querySelector('.options')?.value.trim();

            if (!arabicWord || !correctAnswer || !optionsText) {
                throw new Error('Fill in all question fields');
            }

            const options = optionsText.split(',').map((opt) => opt.trim());
            if (!options.includes(correctAnswer)) options.push(correctAnswer);
            options.sort(() => Math.random() - 0.5);

            questionsData.push({
                arabic_word: arabicWord,
                correct_answer: correctAnswer,
                options
            });
        });
    } catch (err) {
        showMessage(err.message || 'Invalid questions', 'error', messageDiv);
        return;
    }

    if (questionsData.some((q) => q.options.length < 2)) {
        showMessage('Each question needs at least 2 options', 'error', messageDiv);
        return;
    }

    const maxQuestions = maxQuestionsValue ? parseInt(maxQuestionsValue, 10) : null;
    if (maxQuestionsValue && (Number.isNaN(maxQuestions) || maxQuestions < 1)) {
        showMessage('Max questions must be a positive integer', 'error', messageDiv);
        return;
    }

    try {
        let url = `${API_BASE}/admin/tests`;
        let method = 'POST';
        if (editingTestName) {
            url = `${API_BASE}/admin/tests/${encodeURIComponent(editingTestName)}`;
            method = 'PUT';
        }

        const payload = {
            title,
            description,
            weight,
            enabled: $('test-enabled')?.checked,
            record_score: $('test-record-score')?.checked,
            questions: questionsData
        };
        if (maxQuestions) payload.max_questions = maxQuestions;

        const response = await fetch(url, {
            method,
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
        });
        const data = await response.json();

        if (response.ok) {
            showMessage(editingTestName ? 'Test updated' : 'Test created', 'success', messageDiv);
            setTimeout(() => {
                hideTestFormPanel();
                loadExistingTests();
            }, 800);
        } else {
            showMessage(data.error || 'Failed to save test', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Save error:', error);
        showMessage('Failed to save test', 'error', messageDiv);
    }
}

async function loadExistingTests() {
    try {
        const response = await fetch(`${API_BASE}/tests`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            displayExistingTests(data.tests);
        }
    } catch (error) {
        console.error('Failed to load tests:', error);
    }
}

function displayExistingTests(tests) {
    const container = $('tests-list-admin');
    if (!container) return;
    container.innerHTML = '';

    if (!tests?.length) {
        container.innerHTML = '<div class="empty-state"><p>No tests yet. Tap + New to create one.</p></div>';
        return;
    }

    if (isDesktopUIMode()) {
        displayExistingTestsTable(container, tests);
        return;
    }

    tests.forEach((test) => {
        const card = document.createElement('article');
        card.className = 'admin-card';

        const head = document.createElement('div');
        head.className = 'admin-card-head';
        head.innerHTML = `
            <div>
                <p class="admin-card-title">${escapeHtml(test.title || test.name)}</p>
                <p class="admin-card-meta">${escapeHtml(test.name)}</p>
            </div>`;

        const toggleRow = document.createElement('div');
        toggleRow.className = 'toggle-row';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = test.enabled !== false;
        cb.title = 'Visible to users';
        cb.addEventListener('change', () => patchTestEnabled(test.name, cb.checked, cb));
        const lbl = document.createElement('label');
        lbl.textContent = 'Published';
        toggleRow.appendChild(lbl);
        toggleRow.appendChild(cb);

        const actions = document.createElement('div');
        actions.className = 'admin-card-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-sm btn-sm-edit';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => loadTestForEditing(test.name));
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-sm btn-sm-delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteTestConfirm(test.name));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);

        card.appendChild(head);
        card.appendChild(toggleRow);
        card.appendChild(actions);
        container.appendChild(card);
    });
}

function displayExistingTestsTable(container, tests) {
    const wrap = document.createElement('div');
    wrap.className = 'desktop-table-wrap';
    const table = document.createElement('table');
    table.className = 'desktop-table';
    table.innerHTML = '<thead><tr><th>Title</th><th>Name</th><th>Published</th><th>Actions</th></tr></thead>';
    const tbody = document.createElement('tbody');

    tests.forEach((test) => {
        const tr = document.createElement('tr');
        const titleTd = document.createElement('td');
        titleTd.textContent = test.title || test.name;
        const nameTd = document.createElement('td');
        nameTd.className = 'admin-card-meta';
        nameTd.textContent = test.name;
        const visTd = document.createElement('td');
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = test.enabled !== false;
        cb.addEventListener('change', () => patchTestEnabled(test.name, cb.checked, cb));
        visTd.appendChild(cb);
        const actionsTd = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-sm btn-sm-edit';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => loadTestForEditing(test.name));
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-sm btn-sm-delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteTestConfirm(test.name));
        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(delBtn);
        tr.appendChild(titleTd);
        tr.appendChild(nameTd);
        tr.appendChild(visTd);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}

async function loadTestForEditing(testName) {
    try {
        const response = await fetch(`${API_BASE}/admin/tests/${encodeURIComponent(testName)}`, {
            credentials: 'include'
        });

        if (!response.ok) {
            showMessage('Failed to load test', 'error', $('save-message'));
            return;
        }

        const testData = await response.json();
        resetTestForm();

        $('test-title').value = testData.title || '';
        $('test-description').value = testData.description || '';
        $('test-weight').value = testData.weight || 1;
        $('test-max-questions').value = testData.max_questions || '';
        $('test-enabled').checked = testData.enabled !== false;
        $('test-record-score').checked = testData.record_score === true;

        testData.questions.forEach((question) => {
            const questionId = questionCounter++;
            const optionsStr = (question.options || []).join(', ');
            $('questions-list').appendChild(
                buildQuestionEditor(questionId, {
                    arabic_word: question.arabic_word,
                    correct_answer: question.correct_answer,
                    options: optionsStr
                })
            );
            questions.push(questionId);
        });

        $('test-form-title').textContent = `Edit: ${testData.title}`;
        $('btn-save-test').textContent = 'Update test';
        editingTestName = testName;
        openTestFormOverlay();
    } catch (error) {
        console.error('Failed to load test:', error);
        showMessage('Failed to load test', 'error', $('save-message'));
    }
}

async function deleteTestConfirm(testName) {
    if (!confirm(`Delete "${testName}"? This cannot be undone.`)) return;

    try {
        const response = await fetch(`${API_BASE}/admin/tests/${encodeURIComponent(testName)}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json();
        if (response.ok) {
            showMessage('Test deleted', 'success', $('save-message'));
            loadExistingTests();
        } else {
            showMessage(data.error || 'Failed to delete', 'error', $('save-message'));
        }
    } catch (error) {
        console.error('Delete error:', error);
        showMessage('Failed to delete test', 'error', $('save-message'));
    }
}

async function patchTestEnabled(testName, enabled, checkboxEl) {
    try {
        const response = await fetch(
            `${API_BASE}/admin/tests/${encodeURIComponent(testName)}/enabled`,
            {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ enabled })
            }
        );
        const data = await response.json();
        if (!response.ok) {
            checkboxEl.checked = !enabled;
            showMessage(data.error || 'Failed to update', 'error', $('save-message'));
        }
    } catch (err) {
        console.error(err);
        checkboxEl.checked = !enabled;
        showMessage('Failed to update visibility', 'error', $('save-message'));
    }
}

async function createNewUser() {
    const username = $('user-username')?.value.trim();
    const password = $('user-password')?.value.trim();
    const role = $('user-role')?.value;
    const messageDiv = $('user-create-message');

    if (editingUserId) {
        if (passwordModified && password.length < 4) {
            showMessage('Password must be at least 4 characters', 'error', messageDiv);
            return;
        }
        try {
            const response = await fetch(`${API_BASE}/admin/users/${editingUserId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ password, role, update_password: passwordModified })
            });
            const data = await response.json();
            if (response.ok) {
                showMessage('User updated', 'success', messageDiv);
                setTimeout(() => {
                    resetUserForm();
                    loadExistingUsers();
                }, 800);
            } else {
                showMessage(data.error || 'Failed to update user', 'error', messageDiv);
            }
        } catch (error) {
            console.error('User update error:', error);
            showMessage('Failed to update user', 'error', messageDiv);
        }
        return;
    }

    if (!username || !password) {
        showMessage('Please fill in all fields', 'error', messageDiv);
        return;
    }
    if (password.length < 4) {
        showMessage('Password must be at least 4 characters', 'error', messageDiv);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/admin/users`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password, role })
        });
        const data = await response.json();
        if (response.ok) {
            showMessage('User created', 'success', messageDiv);
            $('user-username').value = '';
            $('user-password').value = '';
            $('user-role').value = 'user';
            loadExistingUsers();
        } else {
            showMessage(data.error || 'Failed to create user', 'error', messageDiv);
        }
    } catch (error) {
        console.error('User creation error:', error);
        showMessage('Failed to create user', 'error', messageDiv);
    }
}

async function loadExistingUsers() {
    try {
        const response = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            displayExistingUsers(data.users);
        }
    } catch (error) {
        console.error('Failed to load users:', error);
    }
}

function displayExistingUsers(users) {
    const container = $('users-list-admin');
    if (!container) return;
    container.innerHTML = '';

    if (!users?.length) {
        container.innerHTML = '<div class="empty-state"><p>No users found.</p></div>';
        return;
    }

    if (isDesktopUIMode()) {
        displayExistingUsersTable(container, users);
        return;
    }

    users.forEach((user) => {
        const card = document.createElement('article');
        card.className = 'admin-card';
        const roleClass = user.role === 'admin' ? 'admin' : 'user';
        const date = new Date(user.created_at).toLocaleDateString();

        card.innerHTML = `
            <div class="admin-card-head">
                <div>
                    <p class="admin-card-title">${escapeHtml(user.username)}</p>
                    <span class="role-badge ${roleClass}">${escapeHtml(user.role)}</span>
                </div>
            </div>
            <p class="admin-card-meta">Created ${escapeHtml(date)}</p>`;

        const actions = document.createElement('div');
        actions.className = 'admin-card-actions';
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-sm btn-sm-edit';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => loadUserForEditing(user.id));
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-sm btn-sm-delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteUserConfirm(user.id, user.username));
        actions.appendChild(editBtn);
        actions.appendChild(delBtn);
        card.appendChild(actions);
        container.appendChild(card);
    });
}

function displayExistingUsersTable(container, users) {
    const wrap = document.createElement('div');
    wrap.className = 'desktop-table-wrap';
    const table = document.createElement('table');
    table.className = 'desktop-table';
    table.innerHTML = '<thead><tr><th>Username</th><th>Role</th><th>Created</th><th>Actions</th></tr></thead>';
    const tbody = document.createElement('tbody');

    users.forEach((user) => {
        const tr = document.createElement('tr');
        const date = new Date(user.created_at).toLocaleDateString();
        tr.innerHTML = `
            <td><strong>${escapeHtml(user.username)}</strong></td>
            <td>${escapeHtml(user.role)}</td>
            <td>${escapeHtml(date)}</td>`;
        const actionsTd = document.createElement('td');
        const editBtn = document.createElement('button');
        editBtn.type = 'button';
        editBtn.className = 'btn-sm btn-sm-edit';
        editBtn.textContent = 'Edit';
        editBtn.addEventListener('click', () => loadUserForEditing(user.id));
        const delBtn = document.createElement('button');
        delBtn.type = 'button';
        delBtn.className = 'btn-sm btn-sm-delete';
        delBtn.textContent = 'Delete';
        delBtn.addEventListener('click', () => deleteUserConfirm(user.id, user.username));
        actionsTd.appendChild(editBtn);
        actionsTd.appendChild(delBtn);
        tr.appendChild(actionsTd);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}

async function loadUserForEditing(userId) {
    try {
        const response = await fetch(`${API_BASE}/admin/users`, { credentials: 'include' });
        if (!response.ok) return;

        const data = await response.json();
        const user = data.users.find((u) => u.id === userId);
        if (!user) return;

        $('user-username').value = user.username;
        $('user-username').disabled = true;
        $('user-password').value = '';
        $('user-password').placeholder = 'New password (optional)';
        $('user-password').required = false;
        $('user-password').oninput = () => { passwordModified = true; };
        $('user-role').value = user.role;
        passwordModified = false;

        $('user-form-title').textContent = `Edit: ${user.username}`;
        $('btn-user-save').textContent = 'Update user';
        $('btn-user-cancel').removeAttribute('hidden');
        editingUserId = userId;
        $('panel-users')?.scrollIntoView({ behavior: 'smooth' });
    } catch (error) {
        console.error('Failed to load user:', error);
    }
}

function resetUserForm() {
    $('user-username').value = '';
    $('user-username').disabled = false;
    $('user-password').value = '';
    $('user-password').placeholder = 'Min 4 characters';
    $('user-password').required = true;
    $('user-password').oninput = null;
    $('user-role').value = 'user';
    $('user-form-title').textContent = 'Create user';
    $('btn-user-save').textContent = 'Create user';
    $('btn-user-cancel')?.setAttribute('hidden', '');
    $('user-create-message').className = 'message';
    editingUserId = null;
    passwordModified = false;
}

async function deleteUserConfirm(userId, username) {
    if (!confirm(`Delete user "${username}"? This cannot be undone.`)) return;

    try {
        const response = await fetch(`${API_BASE}/admin/users/${userId}`, {
            method: 'DELETE',
            credentials: 'include'
        });
        const data = await response.json();
        const messageDiv = $('user-create-message');
        if (response.ok) {
            showMessage('User deleted', 'success', messageDiv);
            loadExistingUsers();
        } else {
            showMessage(data.error || 'Failed to delete user', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Delete error:', error);
        showMessage('Failed to delete user', 'error', $('user-create-message'));
    }
}

function scoreColor(score) {
    if (score >= 70) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--danger)';
}

async function loadAdminScores() {
    try {
        const response = await fetch(`${API_BASE}/admin/scores`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            displayAdminScores(data.scores);
        }
    } catch (error) {
        console.error('Failed to load scores:', error);
    }
}

function displayAdminScores(scores) {
    const container = $('admin-scores-list');
    if (!container) return;
    container.innerHTML = '';

    if (!scores?.length) {
        container.innerHTML = '<div class="empty-state"><p>No scores recorded yet.</p></div>';
        return;
    }

    const userWeightedScores = {};
    scores.forEach((score) => {
        if (!userWeightedScores[score.username]) {
            userWeightedScores[score.username] = { totalWeightedScore: 0, totalWeight: 0 };
        }
        const weight = score.weight || 1;
        userWeightedScores[score.username].totalWeightedScore += score.score * weight;
        userWeightedScores[score.username].totalWeight += weight;
    });

    const summary = document.createElement('div');
    summary.className = 'summary-card';
    summary.style.marginBottom = '16px';
    let summaryInner = '<div style="display:flex;flex-wrap:wrap;gap:12px;justify-content:center;">';
    Object.keys(userWeightedScores).forEach((username) => {
        const d = userWeightedScores[username];
        const avg = d.totalWeightedScore / d.totalWeight;
        summaryInner += `
            <div style="text-align:center;min-width:100px;">
                <div style="font-size:0.75rem;opacity:0.9;">${escapeHtml(username)}</div>
                <div style="font-size:1.5rem;font-weight:800;color:${scoreColor(avg)}">${avg.toFixed(1)}%</div>
            </div>`;
    });
    summaryInner += '</div>';
    summary.innerHTML = summaryInner;
    container.appendChild(summary);

    if (isDesktopUIMode()) {
        const wrap = document.createElement('div');
        wrap.className = 'desktop-table-wrap';
        const table = document.createElement('table');
        table.className = 'desktop-table';
        table.innerHTML = '<thead><tr><th>User</th><th>Test</th><th>Weight</th><th>Score</th><th>Correct</th><th>Date</th></tr></thead>';
        const tbody = document.createElement('tbody');
        scores.forEach((score) => {
            const tr = document.createElement('tr');
            const date = new Date(score.created_at).toLocaleDateString();
            const weight = score.weight || 1;
            tr.innerHTML = `
                <td><strong>${escapeHtml(score.username)}</strong></td>
                <td>${escapeHtml(score.test_name)}</td>
                <td>${weight}</td>
                <td style="color:${scoreColor(score.score)};font-weight:700">${Math.round(score.score)}%</td>
                <td>${escapeHtml(String(score.correct))}/${escapeHtml(String(score.total))}</td>
                <td>${escapeHtml(date)}</td>`;
            tbody.appendChild(tr);
        });
        table.appendChild(tbody);
        wrap.appendChild(table);
        container.appendChild(wrap);
        return;
    }

    scores.forEach((score) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        const date = new Date(score.created_at).toLocaleDateString();
        const weight = score.weight || 1;
        row.innerHTML = `
            <div>
                <div class="name">${escapeHtml(score.username)} · ${escapeHtml(score.test_name)}</div>
                <div class="meta">${escapeHtml(String(score.correct))}/${escapeHtml(String(score.total))} · w${weight} · ${escapeHtml(date)}</div>
            </div>
            <div class="pct" style="color:${scoreColor(score.score)}">${score.score.toFixed(1)}%</div>`;
        container.appendChild(row);
    });
}

async function loadSettings() {
    try {
        const response = await fetch(`${API_BASE}/admin/config`, { credentials: 'include' });
        if (!response.ok) return;

        const data = await response.json();
        const registrationEnabled = data.config.registration_enabled === 'true';
        $('registration-toggle').checked = registrationEnabled;
        $('registration-status').textContent = registrationEnabled ? 'Enabled' : 'Disabled';

        const retakeAllowed = data.config.retake_allowed === 'true';
        $('retake-toggle').checked = retakeAllowed;
        $('retake-status').textContent = retakeAllowed ? 'Enabled' : 'Disabled';
    } catch (error) {
        console.error('Failed to load settings:', error);
    }
}

async function saveRegistrationSetting() {
    const enabled = $('registration-toggle')?.checked;
    const messageDiv = $('registration-message');
    try {
        const response = await fetch(`${API_BASE}/admin/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: 'registration_enabled', value: enabled ? 'true' : 'false' })
        });
        const data = await response.json();
        if (response.ok) {
            $('registration-status').textContent = enabled ? 'Enabled' : 'Disabled';
            showMessage('Registration setting saved', 'success', messageDiv);
        } else {
            showMessage(data.error || 'Failed to save', 'error', messageDiv);
        }
    } catch (error) {
        showMessage('Failed to save setting', 'error', messageDiv);
    }
}

async function saveRetakeSetting() {
    const allowed = $('retake-toggle')?.checked;
    const messageDiv = $('retake-message');
    try {
        const response = await fetch(`${API_BASE}/admin/config`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ key: 'retake_allowed', value: allowed ? 'true' : 'false' })
        });
        const data = await response.json();
        if (response.ok) {
            $('retake-status').textContent = allowed ? 'Enabled' : 'Disabled';
            showMessage('Retake setting saved', 'success', messageDiv);
        } else {
            showMessage(data.error || 'Failed to save', 'error', messageDiv);
        }
    } catch (error) {
        showMessage('Failed to save setting', 'error', messageDiv);
    }
}
