(function (global) {
    const STORAGE_KEY = 'uiViewMode';
    const MODES = ['mobile', 'desktop'];

    function getUIMode() {
        const saved = localStorage.getItem(STORAGE_KEY);
        if (MODES.includes(saved)) return saved;
        return window.innerWidth > 900 ? 'desktop' : 'mobile';
    }

    function getDesktopStylesheet() {
        return document.getElementById('ui-desktop-styles');
    }

    function applyUIMode(mode) {
        const resolved = MODES.includes(mode) ? mode : getUIMode();
        const desktopLink = getDesktopStylesheet();

        if (desktopLink) {
            desktopLink.disabled = resolved !== 'desktop';
        }

        document.documentElement.dataset.uiMode = resolved;

        const body = document.body;
        if (body) {
            body.classList.remove('mobile-app', 'desktop-app');
            body.classList.add(resolved === 'desktop' ? 'desktop-app' : 'mobile-app');
        }

        const theme = document.querySelector('meta[name="theme-color"]');
        if (theme) {
            theme.content = resolved === 'desktop' ? '#667eea' : '#0f1117';
        }

        document.querySelectorAll('[data-ui-mode-toggle]').forEach((btn) => {
            const label = resolved === 'desktop' ? 'Switch to mobile view' : 'Switch to desktop view';
            btn.textContent = label;
            btn.setAttribute('aria-label', label);
        });
    }

    function setUIMode(mode) {
        if (!MODES.includes(mode)) return;
        localStorage.setItem(STORAGE_KEY, mode);
        applyUIMode(mode);
    }

    function toggleUIMode() {
        setUIMode(getUIMode() === 'mobile' ? 'desktop' : 'mobile');
        window.location.reload();
    }

    function applyUIModeEarly() {
        const mode = getUIMode();
        document.documentElement.dataset.uiMode = mode;
        const desktopLink = getDesktopStylesheet();
        if (desktopLink) {
            desktopLink.disabled = mode !== 'desktop';
        }
    }

    function setupUIModeToggle() {
        document.querySelectorAll('[data-ui-mode-toggle]').forEach((btn) => {
            if (btn.dataset.uiBound) return;
            btn.dataset.uiBound = '1';
            btn.addEventListener('click', toggleUIMode);
        });
        applyUIMode(getUIMode());
    }

    applyUIModeEarly();

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => {
            applyUIMode(getUIMode());
            setupUIModeToggle();
        });
    } else {
        applyUIMode(getUIMode());
        setupUIModeToggle();
    }

    global.UIMode = {
        getUIMode,
        setUIMode,
        toggleUIMode,
        applyUIMode,
        setupUIModeToggle
    };
})(typeof window !== 'undefined' ? window : globalThis);
