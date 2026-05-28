const API_BASE = '/app/api';

let currentUser = null;
let currentTest = null;

const $ = (id) => document.getElementById(id);

function isDesktopUIMode() {
    return document.body.classList.contains('desktop-app');
}

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
    const authForm = $('auth-form');
    if (authForm) {
        authForm.setAttribute('method', 'post');
        authForm.setAttribute('action', '#');
        authForm.addEventListener('submit', (e) => {
            e.preventDefault();
            e.stopPropagation();
            login();
            return false;
        });
    }
    $('btn-register')?.addEventListener('click', register);
    $('btn-menu')?.addEventListener('click', (e) => {
        e.stopPropagation();
        openMenu();
    });
    $('sheet-overlay')?.addEventListener('click', (e) => {
        if (e.target === $('sheet-overlay')) closeMenu();
    });
    const testForm = $('test-form');
    if (testForm) {
        testForm.setAttribute('method', 'post');
        testForm.setAttribute('action', '#');
        testForm.addEventListener('submit', (e) => {
            e.preventDefault();
            submitTest(e);
            return false;
        });
    }
    $('btn-back-test')?.addEventListener('click', () => leaveTestWithConfirm());
    $('btn-back-results')?.addEventListener('click', backToTests);
    $('btn-change-password')?.addEventListener('click', changePassword);
    $('btn-save-colors')?.addEventListener('click', saveColorPreferences);

    document.querySelectorAll('.nav-item[data-tab]').forEach((btn) => {
        btn.addEventListener('click', () => switchUserTab(btn.dataset.tab));
    });

    document.querySelectorAll('.sheet-link').forEach((link) => {
        link.addEventListener('click', (e) => {
            if (link.id === 'link-admin' && currentUser?.role !== 'admin') {
                e.preventDefault();
                return;
            }
            if (!isTestInProgress()) closeMenu();
            navigateAwayWithConfirm(e, link.href);
        });
    });
    $('btn-logout')?.addEventListener('click', (e) => {
        e.preventDefault();
        closeMenu();
        logoutWithConfirm();
    });

    window.addEventListener('beforeunload', (e) => {
        if (isTestInProgress()) {
            e.preventDefault();
            e.returnValue = '';
        }
    });

    $('btn-leave-cancel')?.addEventListener('click', () => closeLeaveTestDialog(false));
    $('btn-leave-confirm')?.addEventListener('click', () => closeLeaveTestDialog(true));
    $('leave-test-dialog')?.addEventListener('click', (e) => {
        if (e.target === $('leave-test-dialog')) closeLeaveTestDialog(false);
    });

    checkAuth();
});

function isTestInProgress() {
    const testView = $('test-view');
    return !!(currentTest && testView && !testView.hasAttribute('hidden'));
}

function setTestActive(active) {
    document.body.classList.toggle('test-active', !!active);
}

let leaveTestResolve = null;

function confirmLeaveTest() {
    if (!isTestInProgress()) return Promise.resolve(true);

    return new Promise((resolve) => {
        if (leaveTestResolve) {
            resolve(false);
            return;
        }
        leaveTestResolve = resolve;
        const dialog = $('leave-test-dialog');
        dialog?.removeAttribute('hidden');
        dialog?.setAttribute('aria-hidden', 'false');
    });
}

function closeLeaveTestDialog(result) {
    const dialog = $('leave-test-dialog');
    dialog?.setAttribute('hidden', '');
    dialog?.setAttribute('aria-hidden', 'true');
    if (leaveTestResolve) {
        leaveTestResolve(result);
        leaveTestResolve = null;
    }
}

function abandonTest() {
    currentTest = null;
    setTestActive(false);
    $('tests-list-view')?.removeAttribute('hidden');
    $('test-view')?.setAttribute('hidden', '');
    $('results-view')?.setAttribute('hidden', '');
}

async function leaveTestWithConfirm() {
    const ok = await confirmLeaveTest();
    if (!ok) return;
    abandonTest();
    setTopTitle('Tests');
    loadTests();
}

async function navigateAwayWithConfirm(e, href) {
    if (!isTestInProgress()) return;
    e.preventDefault();
    const ok = await confirmLeaveTest();
    if (ok) {
        abandonTest();
        closeMenu();
        window.location.href = href;
    }
}

async function logoutWithConfirm() {
    if (isTestInProgress()) {
        const ok = await confirmLeaveTest();
        if (!ok) return;
        abandonTest();
    }
    await logout();
}

function positionDesktopMenu() {
    const btn = $('btn-menu');
    const sheet = document.querySelector('#sheet-overlay .action-sheet');
    if (!btn || !sheet) return;

    const rect = btn.getBoundingClientRect();
    const gap = 8;
    const menuWidth = 220;

    let top = rect.bottom + gap;
    let right = window.innerWidth - rect.right;

    if (top + 200 > window.innerHeight) {
        top = Math.max(8, rect.top - gap - 200);
    }
    if (right + menuWidth > window.innerWidth) {
        right = 8;
    }

    sheet.style.position = 'fixed';
    sheet.style.top = `${top}px`;
    sheet.style.right = `${right}px`;
    sheet.style.left = 'auto';
    sheet.style.bottom = 'auto';
    sheet.style.width = `${menuWidth}px`;
    sheet.style.maxWidth = `${menuWidth}px`;
    sheet.style.transform = 'none';
}

function openMenu() {
    const overlay = $('sheet-overlay');
    if (!overlay) return;

    if (overlay.classList.contains('open') && isDesktopUIMode()) {
        closeMenu();
        return;
    }

    if (isDesktopUIMode()) {
        overlay.classList.add('menu-desktop');
        positionDesktopMenu();
    } else {
        overlay.classList.remove('menu-desktop');
        document.querySelector('#sheet-overlay .action-sheet')?.removeAttribute('style');
    }

    overlay.classList.add('open');
    overlay.setAttribute('aria-hidden', 'false');
}

function closeMenu() {
    const overlay = $('sheet-overlay');
    if (!overlay) return;
    overlay.classList.remove('open', 'menu-desktop');
    overlay.setAttribute('aria-hidden', 'true');
    document.querySelector('#sheet-overlay .action-sheet')?.removeAttribute('style');
}

window.addEventListener('resize', () => {
    const overlay = $('sheet-overlay');
    if (overlay?.classList.contains('open') && isDesktopUIMode()) {
        positionDesktopMenu();
    }
});

async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/user`, { credentials: 'include' });
        if (response.ok) {
            currentUser = await response.json();
            showMainScreen();
            loadTests();
        } else {
            showAuthScreen();
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        showAuthScreen();
    }
}

function updateAdminLinkVisibility() {
    const adminLink = $('link-admin');
    if (!adminLink) return;
    const isAdmin = currentUser?.role === 'admin';
    if (isAdmin) {
        adminLink.removeAttribute('hidden');
    } else {
        adminLink.setAttribute('hidden', '');
    }
}

function showAuthScreen() {
    $('auth-screen')?.removeAttribute('hidden');
    $('main-screen')?.setAttribute('hidden', '');
    currentUser = null;
    updateAdminLinkVisibility();
    closeMenu();
}

function showMainScreen() {
    $('auth-screen')?.setAttribute('hidden', '');
    $('main-screen')?.removeAttribute('hidden');
    const chip = $('username-display');
    if (chip && currentUser) chip.textContent = currentUser.username;
    updateAdminLinkVisibility();
    switchUserTab('tests');
    loadColorPreferences();
}

async function register() {
    const username = $('username')?.value.trim();
    const password = $('password')?.value.trim();
    const messageDiv = $('auth-message');

    if (!username || !password) {
        showMessage('Please fill in all fields', 'error', messageDiv);
        return;
    }

    try {
        const response = await fetch(`${API_BASE}/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({ username, password })
        });
        const data = await response.json();

        if (response.ok) {
            showMessage('Registration successful! You can now log in.', 'success', messageDiv);
            $('auth-form')?.reset();
        } else {
            showMessage(data.error || 'Registration failed', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Registration error:', error);
        showMessage('Registration failed', 'error', messageDiv);
    }
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
            showMessage('Welcome back!', 'success', messageDiv);
            $('auth-form')?.reset();
            setTimeout(() => {
                showMainScreen();
                loadTests();
            }, 400);
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
        await fetch(`${API_BASE}/logout`, { method: 'POST', credentials: 'include' });
        currentUser = null;
        closeMenu();
        showAuthScreen();
        $('auth-form')?.reset();
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

        if (testsResponse.ok) {
            const testsData = await testsResponse.json();
            let completed = [];
            if (completedResponse.ok) {
                const completedData = await completedResponse.json();
                completed = completedData.completed_tests || [];
            }
            displayTests(testsData.tests, completed);
        }
    } catch (error) {
        console.error('Failed to load tests:', error);
    }
}

function displayTests(tests, completedTests = []) {
    const list = $('tests-list');
    if (!list) return;
    list.innerHTML = '';

    if (!tests.length) {
        list.innerHTML = `
            <div class="empty-state">
                <div class="icon">📝</div>
                <p>No tests available yet.</p>
            </div>`;
        return;
    }

    if (isDesktopUIMode()) {
        displayTestsTable(list, tests, completedTests);
        return;
    }

    tests.forEach((test) => {
        const isCompleted = completedTests.includes(test.name);
        const card = document.createElement('article');
        card.className = `test-card${isCompleted ? ' completed' : ''}`;

        const body = document.createElement('div');
        body.className = 'test-card-body';
        const title = document.createElement('p');
        title.className = 'test-card-title';
        title.textContent = test.title || test.name;
        const slug = document.createElement('p');
        slug.className = 'test-card-slug';
        slug.textContent = test.name;
        body.appendChild(title);
        body.appendChild(slug);

        if (isCompleted) {
            const badge = document.createElement('span');
            badge.className = 'badge-done';
            badge.textContent = 'Done';
            card.appendChild(body);
            card.appendChild(badge);
        } else {
            card.appendChild(body);
        }

        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-start';
        btn.textContent = isCompleted ? 'Retry' : 'Start';
        btn.addEventListener('click', () => selectTest(test.name));
        card.appendChild(btn);

        list.appendChild(card);
    });
}

function displayTestsTable(list, tests, completedTests) {
    const wrap = document.createElement('div');
    wrap.className = 'desktop-table-wrap';
    const table = document.createElement('table');
    table.className = 'desktop-table';
    table.innerHTML = '<thead><tr><th>Test</th><th>Status</th><th></th></tr></thead>';
    const tbody = document.createElement('tbody');

    tests.forEach((test) => {
        const isCompleted = completedTests.includes(test.name);
        const tr = document.createElement('tr');
        const titleTd = document.createElement('td');
        titleTd.innerHTML = `<strong>${escapeHtml(test.title || test.name)}</strong><div class="test-card-slug">${escapeHtml(test.name)}</div>`;
        const statusTd = document.createElement('td');
        statusTd.textContent = isCompleted ? 'Completed' : '—';
        const actionTd = document.createElement('td');
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn-start';
        btn.textContent = isCompleted ? 'Retry' : 'Start';
        btn.addEventListener('click', () => selectTest(test.name));
        actionTd.appendChild(btn);
        tr.appendChild(titleTd);
        tr.appendChild(statusTd);
        tr.appendChild(actionTd);
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    list.appendChild(wrap);
}

async function selectTest(testName) {
    try {
        const response = await fetch(`${API_BASE}/tests/${encodeURIComponent(testName)}`, {
            credentials: 'include'
        });

        if (response.ok) {
            const testData = await response.json();
            currentTest = { name: testName, data: testData };
            displayTest(testData);
            $('tests-list-view')?.setAttribute('hidden', '');
            $('test-view')?.removeAttribute('hidden');
            $('results-view')?.setAttribute('hidden', '');
            setTestActive(true);
            setTopTitle(testData.title || 'Test');
        }
    } catch (error) {
        console.error('Failed to load test:', error);
    }
}

function displayTest(testData) {
    const titleEl = $('test-title');
    if (titleEl) titleEl.textContent = testData.title || 'Test';

    const container = $('questions-container');
    if (!container) return;
    container.innerHTML = '';

    const requireAllAnswers = testData.record_score === true;

    testData.questions.forEach((question, index) => {
        const card = document.createElement('div');
        card.className = 'question-card';

        const num = document.createElement('div');
        num.className = 'q-num';
        num.textContent = `Question ${index + 1}`;
        card.appendChild(num);

        const arabic = document.createElement('p');
        arabic.className = 'arabic';
        arabic.textContent = question.arabic_word || '';
        card.appendChild(arabic);

        const optionsWrap = document.createElement('div');
        optionsWrap.className = 'option-list';

        const rawOptions = Array.isArray(question.options) ? question.options.slice() : [];
        const correctAnswer = question.correct_answer || '';
        if (correctAnswer && !rawOptions.includes(correctAnswer)) {
            rawOptions.push(correctAnswer);
        }
        const uniqueOptions = [...new Set(
            rawOptions.filter((opt) => opt !== null && opt !== undefined && String(opt).trim() !== '')
        )];

        uniqueOptions.forEach((option) => {
            const label = document.createElement('label');
            label.className = 'option-item';

            const input = document.createElement('input');
            input.type = 'radio';
            input.name = `answer-${index}`;
            input.value = String(option);
            if (requireAllAnswers) input.required = true;

            const span = document.createElement('span');
            span.textContent = String(option);

            label.appendChild(input);
            label.appendChild(span);
            optionsWrap.appendChild(label);
        });

        card.appendChild(optionsWrap);
        container.appendChild(card);
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
        const response = await fetch(
            `${API_BASE}/tests/${encodeURIComponent(currentTest.name)}/submit`,
            {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ answers })
            }
        );

        if (response.ok) {
            const results = await response.json();
            displayResults(results);
            $('test-view')?.setAttribute('hidden', '');
            $('results-view')?.removeAttribute('hidden');
            setTestActive(false);
            setTopTitle('Results');
            scrollToResultsTop();
        }
    } catch (error) {
        console.error('Failed to submit test:', error);
    }
}

function parsePercentage(pctStr) {
    const n = parseFloat(String(pctStr).replace('%', ''));
    return Number.isFinite(n) ? Math.min(100, Math.max(0, n)) : 0;
}

function scrollToResultsTop() {
    requestAnimationFrame(() => {
        const scrollEl = document.querySelector('.content-area');
        if (scrollEl) scrollEl.scrollTo({ top: 0, behavior: 'smooth' });
    });
}

function displayResults(results) {
    const pctEl = $('result-percentage');
    const ring = $('score-ring');
    const pct = Math.round(parsePercentage(results.percentage));

    if (pctEl) pctEl.textContent = `${pct}%`;
    if (ring) ring.style.setProperty('--pct', String(pct));
    if ($('result-correct')) $('result-correct').textContent = results.correct;
    if ($('result-total')) $('result-total').textContent = results.total;

    const container = $('answers-breakdown');
    if (!container || !results.answers?.length) return;
    container.innerHTML = '';

    results.answers.forEach((answer) => {
        const card = document.createElement('article');
        card.className = `answer-card ${answer.is_correct ? 'correct' : 'incorrect'}`;

        const head = document.createElement('div');
        head.className = 'a-head';

        const icon = document.createElement('span');
        icon.className = 'a-icon';
        icon.textContent = answer.is_correct ? '✓' : '✗';

        const qText = document.createElement('div');
        qText.innerHTML = `<strong>Q${answer.question_number}</strong>
            <div class="arabic-sm">${escapeHtml(answer.arabic_word)}</div>`;

        head.appendChild(icon);
        head.appendChild(qText);
        card.appendChild(head);

        const yourRow = document.createElement('div');
        yourRow.className = 'answer-row';
        yourRow.innerHTML = `Your answer: <strong>${escapeHtml(answer.user_answer || '(blank)')}</strong>`;
        card.appendChild(yourRow);

        if (!answer.is_correct) {
            const correctRow = document.createElement('div');
            correctRow.className = 'answer-row';
            correctRow.innerHTML = `Correct: <strong>${escapeHtml(answer.correct_answer)}</strong>`;
            card.appendChild(correctRow);
        }

        container.appendChild(card);
    });
}

function backToTests() {
    setTestActive(false);
    $('tests-list-view')?.removeAttribute('hidden');
    $('test-view')?.setAttribute('hidden', '');
    $('results-view')?.setAttribute('hidden', '');
    setTopTitle('Tests');
    loadTests();
}

const TAB_TITLES = { tests: 'Tests', scores: 'My scores', profile: 'Profile' };

async function switchUserTab(tabName) {
    if (isTestInProgress()) {
        const ok = await confirmLeaveTest();
        if (!ok) return;
        abandonTest();
        closeMenu();
    }

    document.querySelectorAll('.panel').forEach((p) => p.classList.remove('active'));
    document.querySelectorAll('.nav-item[data-tab]').forEach((n) => n.classList.remove('active'));

    const panel = $(`panel-${tabName}`);
    const nav = $(`nav-${tabName}`);
    if (panel) panel.classList.add('active');
    if (nav) nav.classList.add('active');

    setTopTitle(TAB_TITLES[tabName] || 'Tester App');

    if (tabName === 'tests') {
        if (!$('results-view')?.hasAttribute('hidden')) {
            backToTests();
        } else {
            loadTests();
        }
    } else if (tabName === 'scores') {
        loadUserScores();
    } else if (tabName === 'profile') {
        loadColorPreferences();
    }
}

async function loadUserScores() {
    try {
        const response = await fetch(`${API_BASE}/scores`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            displayUserScores(data.scores);
        }
    } catch (error) {
        console.error('Failed to load scores:', error);
    }
}

function scoreColor(score) {
    if (score >= 70) return 'var(--success)';
    if (score >= 50) return 'var(--warning)';
    return 'var(--danger)';
}

function displayUserScores(scores) {
    const container = $('scores-list');
    if (!container) return;
    container.innerHTML = '';

    if (!scores.length) {
        container.innerHTML = `
            <div class="empty-state">
                <div class="icon">📊</div>
                <p>No scores recorded yet.</p>
            </div>`;
        return;
    }

    let totalWeighted = 0;
    let totalWeight = 0;
    scores.forEach((s) => {
        const w = s.weight || 1;
        totalWeighted += s.score * w;
        totalWeight += w;
    });
    const avg = totalWeight > 0 ? totalWeighted / totalWeight : 0;

    if (isDesktopUIMode()) {
        displayUserScoresTable(container, scores, avg, totalWeight);
        return;
    }

    const summary = document.createElement('div');
    summary.className = 'summary-card';
    summary.innerHTML = `
        <div class="big-score" style="color: ${scoreColor(avg)}">${avg.toFixed(1)}%</div>
        <div class="label">Weighted average</div>
        <div class="summary-meta">
            <span>${scores.length} tests</span>
            <span>Weight ${totalWeight}</span>
        </div>`;
    container.appendChild(summary);

    scores.forEach((score) => {
        const row = document.createElement('div');
        row.className = 'score-row';
        const date = new Date(score.created_at).toLocaleDateString();
        const weight = score.weight || 1;
        const pct = score.score.toFixed(1);

        row.innerHTML = `
            <div>
                <div class="name">${escapeHtml(score.test_name)}</div>
                <div class="meta">${escapeHtml(String(score.correct))}/${escapeHtml(String(score.total))} · weight ${weight} · ${escapeHtml(date)}</div>
            </div>
            <div class="pct" style="color: ${scoreColor(score.score)}">${pct}%</div>`;
        container.appendChild(row);
    });
}

function displayUserScoresTable(container, scores, avg, totalWeight) {
    const summary = document.createElement('div');
    summary.className = 'summary-card';
    summary.innerHTML = `
        <div class="big-score" style="color: ${scoreColor(avg)}">${avg.toFixed(0)}%</div>
        <div class="label">Weighted average</div>
        <div class="summary-meta">
            <span>${scores.length} tests</span>
            <span>Weight ${totalWeight}</span>
        </div>`;
    container.appendChild(summary);

    const wrap = document.createElement('div');
    wrap.className = 'desktop-table-wrap';
    const table = document.createElement('table');
    table.className = 'desktop-table';
    table.innerHTML = '<thead><tr><th>Test</th><th>Weight</th><th>Score</th><th>Correct</th><th>Date</th></tr></thead>';
    const tbody = document.createElement('tbody');

    scores.forEach((score) => {
        const tr = document.createElement('tr');
        const date = new Date(score.created_at).toLocaleDateString();
        const weight = score.weight || 1;
        const pct = Math.round(score.score);
        tr.innerHTML = `
            <td>${escapeHtml(score.test_name)}</td>
            <td>${weight}</td>
            <td style="color:${scoreColor(score.score)};font-weight:700">${pct}%</td>
            <td>${escapeHtml(String(score.correct))}/${escapeHtml(String(score.total))}</td>
            <td>${escapeHtml(date)}</td>`;
        tbody.appendChild(tr);
    });

    table.appendChild(tbody);
    wrap.appendChild(table);
    container.appendChild(wrap);
}

async function changePassword() {
    const currentPassword = $('current-password')?.value.trim();
    const newPassword = $('new-password')?.value.trim();
    const confirmPassword = $('confirm-password')?.value.trim();
    const messageDiv = $('password-message');

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
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword,
                confirm_password: confirmPassword
            })
        });
        const data = await response.json();

        if (response.ok) {
            showMessage('Password updated', 'success', messageDiv);
            $('current-password').value = '';
            $('new-password').value = '';
            $('confirm-password').value = '';
        } else {
            showMessage(data.error || 'Failed to change password', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Password change error:', error);
        showMessage('Failed to change password', 'error', messageDiv);
    }
}

async function loadColorPreferences() {
    try {
        const response = await fetch(`${API_BASE}/user-preferences`, { credentials: 'include' });
        if (!response.ok) return;

        const preferences = await response.json();
        const primary = preferences.primary_color || '#5b6cff';
        const secondary = preferences.secondary_color || '#7c3aed';
        const accent = preferences.accent_color || '#ec4899';

        if ($('primary-color')) $('primary-color').value = primary;
        if ($('secondary-color')) $('secondary-color').value = secondary;
        if ($('accent-color')) $('accent-color').value = accent;

        applyThemeColors(primary, secondary, accent);
        setupColorListeners();
    } catch (error) {
        console.error('Failed to load color preferences:', error);
    }
}

function applyThemeColors(primary, secondary, accent) {
    document.documentElement.style.setProperty('--primary', primary);
    document.documentElement.style.setProperty('--secondary', secondary);
    document.documentElement.style.setProperty('--accent', accent);
}

function setupColorListeners() {
    ['primary-color', 'secondary-color', 'accent-color'].forEach((id) => {
        const input = $(id);
        if (!input || input.dataset.bound) return;
        input.dataset.bound = '1';
        input.addEventListener('input', () => {
            applyThemeColors(
                $('primary-color')?.value || '#5b6cff',
                $('secondary-color')?.value || '#7c3aed',
                $('accent-color')?.value || '#ec4899'
            );
        });
    });
}

async function saveColorPreferences() {
    const primaryColor = $('primary-color')?.value;
    const secondaryColor = $('secondary-color')?.value;
    const accentColor = $('accent-color')?.value;
    const messageDiv = $('color-message');

    try {
        const response = await fetch(`${API_BASE}/user-preferences`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({
                primary_color: primaryColor,
                secondary_color: secondaryColor,
                accent_color: accentColor
            })
        });
        const data = await response.json();

        if (response.ok) {
            applyThemeColors(primaryColor, secondaryColor, accentColor);
            showMessage('Colors saved', 'success', messageDiv);
        } else {
            showMessage(data.error || 'Failed to save', 'error', messageDiv);
        }
    } catch (error) {
        console.error('Color preference save error:', error);
        showMessage('Failed to save preferences', 'error', messageDiv);
    }
}
