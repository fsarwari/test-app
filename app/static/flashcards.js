const API_BASE = '/app/api';

let lessons = [];
let currentLessonName = null;
let currentLessonData = null;
let currentMode = null;
let flashcards = [];
let currentCardIndex = 0;
let isCardFlipped = false;
let flashcardFontSize = 32;
const DEFAULT_FLASHCARD_FONT_SIZE = 32;

const $ = (id) => document.getElementById(id);

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text == null ? '' : String(text);
    return div.innerHTML;
}

function setTopTitle(title) {
    const el = $('top-title');
    if (el) el.textContent = title;
}

function showView(viewId) {
    ['lesson-selection-view', 'mode-selection-view', 'flashcards-view'].forEach((id) => {
        const el = $(id);
        if (!el) return;
        if (id === viewId) el.removeAttribute('hidden');
        else el.setAttribute('hidden', '');
    });
}

document.addEventListener('DOMContentLoaded', () => {
    initFontSize();
    $('btn-back-lessons')?.addEventListener('click', backToLessons);
    $('btn-back-modes')?.addEventListener('click', backToModes);
    $('btn-prev')?.addEventListener('click', previousCard);
    $('btn-next')?.addEventListener('click', nextCard);
    $('flashcard')?.addEventListener('click', flipCard);
    $('font-size-slider')?.addEventListener('input', (e) => updateFlashcardFontSize(e.target.value));

    document.querySelectorAll('.mode-card[data-mode]').forEach((card) => {
        const mode = card.dataset.mode;
        card.addEventListener('click', () => startFlashcards(mode));
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                startFlashcards(mode);
            }
        });
    });

    checkAuth();
});

async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/user`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            const chip = $('username-display');
            if (chip) chip.textContent = data.username;
            loadLessons();
        } else {
            window.location.href = '/app/';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/app/';
    }
}

async function loadLessons() {
    const container = $('lessons-list');
    try {
        const response = await fetch(`${API_BASE}/tests`, { credentials: 'include' });
        if (response.ok) {
            const data = await response.json();
            lessons = data.tests || [];
            displayLessons();
        } else if (container) {
            container.innerHTML = '<div class="empty-state"><p>Could not load lessons.</p></div>';
        }
    } catch (error) {
        console.error('Failed to load lessons:', error);
        if (container) {
            container.innerHTML = '<div class="empty-state"><p>Check your connection and try again.</p></div>';
        }
    }
}

function displayLessons() {
    const container = $('lessons-list');
    if (!container) return;
    container.innerHTML = '';

    if (!lessons.length) {
        container.innerHTML = '<div class="empty-state"><div class="icon">🎴</div><p>No lessons available yet.</p></div>';
        return;
    }

    lessons.forEach((lesson) => {
        const card = document.createElement('article');
        card.className = 'test-card';
        card.setAttribute('role', 'button');
        card.tabIndex = 0;

        const body = document.createElement('div');
        body.className = 'test-card-body';
        const title = document.createElement('p');
        title.className = 'test-card-title';
        title.textContent = lesson.title || lesson.name;
        const slug = document.createElement('p');
        slug.className = 'test-card-slug';
        slug.textContent = lesson.name;
        body.appendChild(title);
        body.appendChild(slug);

        const arrow = document.createElement('span');
        arrow.className = 'badge-done';
        arrow.textContent = '→';
        arrow.style.background = 'var(--surface-2)';
        arrow.style.color = 'var(--text-muted)';

        card.appendChild(body);
        card.appendChild(arrow);

        const open = () => selectLesson(lesson.name, lesson.title || lesson.name);
        card.addEventListener('click', open);
        card.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                open();
            }
        });

        container.appendChild(card);
    });
}

function selectLesson(lessonName, lessonTitle) {
    currentLessonName = lessonName;
    const titleEl = $('selected-lesson-title');
    if (titleEl) titleEl.textContent = lessonTitle;
    setTopTitle(lessonTitle);
    showView('mode-selection-view');
}

async function startFlashcards(mode) {
    currentMode = mode;
    try {
        const response = await fetch(
            `${API_BASE}/tests/${encodeURIComponent(currentLessonName)}?flashcards=true`,
            { credentials: 'include' }
        );
        if (response.ok) {
            currentLessonData = await response.json();
            prepareFlashcards();
            displayFlashcard();
            showView('flashcards-view');
        }
    } catch (error) {
        console.error('Failed to load lesson:', error);
    }
}

function prepareFlashcards() {
    flashcards = [];
    const questions = currentLessonData?.questions || [];

    questions.forEach((question) => {
        const arabicWord = question.arabic_word || '';
        const englishWord = question.correct_answer || '';
        if (currentMode === 'english') {
            flashcards.push({ front: englishWord, back: arabicWord, backRtl: true });
        } else {
            flashcards.push({ front: arabicWord, back: englishWord, frontRtl: true, backRtl: false });
        }
    });

    currentCardIndex = 0;
    isCardFlipped = false;
}

function displayFlashcard() {
    if (!flashcards.length) return;

    const card = flashcards[currentCardIndex];
    const lessonTitle = $('selected-lesson-title')?.textContent || '';
    const modeLabel = currentMode === 'english' ? 'English first' : 'Arabic first';

    if ($('flashcards-title')) {
        $('flashcards-title').textContent = `${lessonTitle} · ${modeLabel}`;
    }
    if ($('card-counter')) {
        $('card-counter').textContent = `${currentCardIndex + 1} / ${flashcards.length}`;
    }

    isCardFlipped = false;
    $('flashcard')?.classList.remove('flipped');
    applyFlashcardFontSize();

    const front = $('front-text');
    const back = $('back-text');
    if (front) {
        front.textContent = card.front;
        front.removeAttribute('dir');
        if (card.frontRtl) front.setAttribute('dir', 'rtl');
    }
    if (back) {
        back.textContent = card.back;
        back.removeAttribute('dir');
        if (card.backRtl) back.setAttribute('dir', 'rtl');
    }

    const progress = ((currentCardIndex + 1) / flashcards.length) * 100;
    const fill = $('progress-fill');
    if (fill) fill.style.width = `${progress}%`;
}

function initFontSize() {
    const saved = localStorage.getItem('flashcardFontSize');
    flashcardFontSize = saved ? Number(saved) : DEFAULT_FLASHCARD_FONT_SIZE;
    if (!flashcardFontSize || flashcardFontSize < 20 || flashcardFontSize > 56) {
        flashcardFontSize = DEFAULT_FLASHCARD_FONT_SIZE;
    }
    const slider = $('font-size-slider');
    const valueDisplay = $('font-size-value');
    if (slider) slider.value = flashcardFontSize;
    if (valueDisplay) valueDisplay.textContent = flashcardFontSize;
    applyFlashcardFontSize();
}

function updateFlashcardFontSize(value) {
    flashcardFontSize = Number(value);
    localStorage.setItem('flashcardFontSize', String(flashcardFontSize));
    const valueDisplay = $('font-size-value');
    if (valueDisplay) valueDisplay.textContent = flashcardFontSize;
    applyFlashcardFontSize();
}

function applyFlashcardFontSize() {
    const el = $('flashcard');
    if (el) el.style.setProperty('--flashcard-font-size', `${flashcardFontSize}px`);
}

function flipCard() {
    isCardFlipped = !isCardFlipped;
    $('flashcard')?.classList.toggle('flipped', isCardFlipped);
}

function nextCard() {
    if (currentCardIndex < flashcards.length - 1) {
        currentCardIndex += 1;
        displayFlashcard();
    }
}

function previousCard() {
    if (currentCardIndex > 0) {
        currentCardIndex -= 1;
        displayFlashcard();
    }
}

function backToModes() {
    currentCardIndex = 0;
    isCardFlipped = false;
    flashcards = [];
    currentMode = null;
    setTopTitle($('selected-lesson-title')?.textContent || 'Flashcards');
    showView('mode-selection-view');
}

function backToLessons() {
    currentLessonName = null;
    currentLessonData = null;
    setTopTitle('Flashcards');
    showView('lesson-selection-view');
}

document.addEventListener('keydown', (event) => {
    const fcView = $('flashcards-view');
    if (!fcView || fcView.hasAttribute('hidden')) return;
    if (event.key === ' ') {
        event.preventDefault();
        flipCard();
    } else if (event.key === 'ArrowRight') {
        nextCard();
    } else if (event.key === 'ArrowLeft') {
        previousCard();
    }
});
