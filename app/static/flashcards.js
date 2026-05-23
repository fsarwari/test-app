// Flashcards Application
const API_BASE = '/app/api';

// State
let lessons = [];
let currentLessonName = null;
let currentLessonData = null;
let currentMode = null; // 'english' or 'arabic'
let flashcards = [];
let currentCardIndex = 0;
let isCardFlipped = false;
let flashcardFontSize = 32;
const DEFAULT_FLASHCARD_FONT_SIZE = 32;

// Initialize app
document.addEventListener('DOMContentLoaded', function() {
    initFontSize();
    checkAuth();
});

async function checkAuth() {
    try {
        const response = await fetch(`${API_BASE}/user`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            const data = await response.json();
            document.getElementById('username-display').textContent = `${data.username}`;
            document.getElementById('user-info').style.display = 'flex';
            loadLessons();
        } else {
            window.location.href = '/';
        }
    } catch (error) {
        console.error('Auth check failed:', error);
        window.location.href = '/';
    }
}

async function logout() {
    try {
        await fetch(`${API_BASE}/logout`, {
            method: 'POST',
            credentials: 'include'
        });
        window.location.href = '/';
    } catch (error) {
        console.error('Logout error:', error);
    }
}

async function loadLessons() {
    const container = document.getElementById('lessons-list');
    try {
        const response = await fetch(`${API_BASE}/tests`, {
            credentials: 'include'
        });

        if (response.ok) {
            const data = await response.json();
            lessons = data.tests || [];
            displayLessons();
        } else {
            container.innerHTML =
                '<p class="tests-empty-msg">Could not load lessons. Please refresh or go back and sign in again.</p>';
        }
    } catch (error) {
        console.error('Failed to load lessons:', error);
        if (container) {
            container.innerHTML =
                '<p class="tests-empty-msg">Could not load lessons. Check your connection and try again.</p>';
        }
    }
}

function displayLessons() {
    const container = document.getElementById('lessons-list');
    container.innerHTML = '';
    
    if (lessons.length === 0) {
        container.innerHTML = '<p class="tests-empty-msg">No lessons available yet.</p>';
        return;
    }

    const grid = document.createElement('div');
    grid.className = 'lessons-grid';

    lessons.forEach(lesson => {
        const card = document.createElement('div');
        card.className = 'lesson-card';
        card.innerHTML = `
            <div class="lesson-card-content">
                <h3>${lesson.title || lesson.name}</h3>
                <p class="lesson-description">${lesson.name}</p>
            </div>
        `;
        card.addEventListener('click', () => selectLesson(lesson.name, lesson.title || lesson.name));
        grid.appendChild(card);
    });

    container.appendChild(grid);
}

function selectLesson(lessonName, lessonTitle) {
    currentLessonName = lessonName;
    document.getElementById('selected-lesson-title').textContent = lessonTitle;
    
    // Hide lesson selection, show mode selection
    document.getElementById('lesson-selection-view').style.display = 'none';
    document.getElementById('mode-selection-view').style.display = 'block';
}

async function startFlashcards(mode) {
    currentMode = mode;
    
    try {
        const response = await fetch(`${API_BASE}/tests/${currentLessonName}?flashcards=true`, {
            credentials: 'include'
        });
        
        if (response.ok) {
            currentLessonData = await response.json();
            prepareFlashcards();
            displayFlashcard();
            
            // Hide mode selection, show flashcards
            document.getElementById('mode-selection-view').style.display = 'none';
            document.getElementById('flashcards-view').style.display = 'block';
        }
    } catch (error) {
        console.error('Failed to load lesson:', error);
    }
}

function prepareFlashcards() {
    flashcards = [];
    const questions = currentLessonData.questions || [];
    
    questions.forEach((question, index) => {
        const arabicWord = question.arabic_word || '';
        const englishWord = question.correct_answer || '';
        
        if (currentMode === 'english') {
            flashcards.push({
                front: englishWord,
                back: arabicWord,
                frontLabel: 'English',
                backLabel: 'Arabic'
            });
        } else {
            flashcards.push({
                front: arabicWord,
                back: englishWord,
                frontLabel: 'Arabic',
                backLabel: 'English'
            });
        }
    });
    
    currentCardIndex = 0;
    isCardFlipped = false;
}

function displayFlashcard() {
    if (flashcards.length === 0) return;
    
    const card = flashcards[currentCardIndex];
    const lessonTitle = document.getElementById('selected-lesson-title').textContent;
    const modeLabel = currentMode === 'english' ? 'English First' : 'Arabic First';
    
    document.getElementById('flashcards-title').textContent = `${lessonTitle} - ${modeLabel}`;
    document.getElementById('card-counter').textContent = `${currentCardIndex + 1} / ${flashcards.length}`;
    
    // Reset flip state
    isCardFlipped = false;
    const flashcard = document.getElementById('flashcard');
    flashcard.classList.remove('flipped');
    
    applyFlashcardFontSize();
    
    // Update card content
    document.getElementById('front-text').textContent = card.front;
    document.getElementById('back-text').textContent = card.back;
    
    // Update progress bar
    const progress = ((currentCardIndex + 1) / flashcards.length) * 100;
    document.getElementById('progress-fill').style.width = progress + '%';
}

function initFontSize() {
    const savedSize = localStorage.getItem('flashcardFontSize');
    flashcardFontSize = savedSize ? Number(savedSize) : DEFAULT_FLASHCARD_FONT_SIZE;
    if (!flashcardFontSize || flashcardFontSize < 20 || flashcardFontSize > 56) {
        flashcardFontSize = DEFAULT_FLASHCARD_FONT_SIZE;
    }
    const slider = document.getElementById('font-size-slider');
    const valueDisplay = document.getElementById('font-size-value');
    if (slider) slider.value = flashcardFontSize;
    if (valueDisplay) valueDisplay.textContent = flashcardFontSize;
    applyFlashcardFontSize();
}

function updateFlashcardFontSize(value) {
    flashcardFontSize = Number(value);
    localStorage.setItem('flashcardFontSize', flashcardFontSize);
    const valueDisplay = document.getElementById('font-size-value');
    if (valueDisplay) valueDisplay.textContent = flashcardFontSize;
    applyFlashcardFontSize();
}

function applyFlashcardFontSize() {
    const flashcard = document.getElementById('flashcard');
    if (flashcard) {
        flashcard.style.setProperty('--flashcard-font-size', `${flashcardFontSize}px`);
    }
}

function flipCard() {
    isCardFlipped = !isCardFlipped;
    const flashcard = document.getElementById('flashcard');
    
    if (isCardFlipped) {
        flashcard.classList.add('flipped');
    } else {
        flashcard.classList.remove('flipped');
    }
}

function nextCard() {
    if (currentCardIndex < flashcards.length - 1) {
        currentCardIndex++;
        displayFlashcard();
    }
}

function previousCard() {
    if (currentCardIndex > 0) {
        currentCardIndex--;
        displayFlashcard();
    }
}

function backToModes() {
    currentCardIndex = 0;
    isCardFlipped = false;
    flashcards = [];
    currentMode = null;
    
    document.getElementById('flashcards-view').style.display = 'none';
    document.getElementById('mode-selection-view').style.display = 'block';
}

function backToLessons() {
    currentLessonName = null;
    currentLessonData = null;
    
    document.getElementById('mode-selection-view').style.display = 'none';
    document.getElementById('lesson-selection-view').style.display = 'block';
}

// Keyboard navigation
document.addEventListener('keydown', function(event) {
    if (document.getElementById('flashcards-view').style.display !== 'none') {
        if (event.key === ' ') {
            event.preventDefault();
            flipCard();
        } else if (event.key === 'ArrowRight') {
            nextCard();
        } else if (event.key === 'ArrowLeft') {
            previousCard();
        }
    }
});
