const navToggle = document.getElementById("nav-toggle");
const navLinks = document.getElementById("nav-links");

if (navToggle && navLinks) {
    navToggle.addEventListener("click", function() {
        const isOpen = navLinks.classList.toggle("open");
        navToggle.setAttribute("aria-expanded", isOpen);
    });
}

// Dark mode
const themeToggle = document.getElementById("theme-toggle");

function updateThemeIcon() {
    const isDark = document.documentElement.classList.contains("dark");
    themeToggle.textContent = isDark ? "☀️" : "🌙";
}

if (themeToggle) {
    updateThemeIcon();
    themeToggle.addEventListener("click", function() {
        const isDark = document.documentElement.classList.toggle("dark");
        try {
            localStorage.setItem("theme", isDark ? "dark" : "light")
        } catch (e) {}
        updateThemeIcon();
    });
}

// Flash messages fade after 4 sec
document.querySelectorAll(".flash").forEach(function(flash) {
    setTimeout(function () {
        flash.classList.add("hide");
        setTimeout(function () {
            flash.remove();
        }, 500);
    }, 4000);
});

// Journal: live word count
const entryBox = document.getElementById("entry-box");
const wordCount = document.getElementById("word-count");

if (entryBox && wordCount){
    function updateWordCount() {
        const words = entryBox.value.trim().split(/\s+/).filter(Boolean).length;
        let message = words + (words === 1 ? " word": " words");

        if (words > 0 && words < 40) {
            message += " · " + (40 - words) + " more for an AI summary";
        } else if (words >= 40){
            message += ". a summary will be generated ✨";
        }
        wordCount.textContent = message;
    }
    
    entryBox.addEventListener("input", updateWordCount);
    updateWordCount();
}

// Loading state on slow forms
document.querySelectorAll("form[data-loading-text]").forEach(function (form) {
    form.addEventListener("submit", function() {
        const button = form.querySelector("button[type='submit']");
        button.disabled = true;
        button.textContent = form.dataset.loadingText;
    });
});