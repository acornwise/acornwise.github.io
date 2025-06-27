const LS_LAST_DAILY_SELECTION_TIMESTAMP = 'acornwise_lastDailySelectionTimestamp';
const LS_CURRENT_DAILY_SET = 'acornwise_currentDailySet';
const LS_SOLVED_CHALLENGES = 'acornwise_solvedChallenges';
const LS_DAILY_COMPLETION_RECORDS = 'acornwise_dailyCompletionRecords'; // New LS key for daily completions
const LS_QUESTION_FILE_CACHE_PREFIX = 'acornwise_question_file_';
const LS_ALL_METADATA_CACHE = 'acornwise_all_metadata_cache';
const LS_EDITOR_CONTENT_PREFIX = 'acornwise_editor_content_';

const DAILY_CHALLENGE_COUNT = 5;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const METADATA_CACHE_EXPIRATION_MS = 72 * 60 * 60 * 1000; // 72 hours
const ONE_YEAR_MS = 365 * TWENTY_FOUR_HOURS_MS;

document.addEventListener('DOMContentLoaded', () => {
    // NEW: Functions for homepage progress tracker

    // Function to get daily completion records
    function getDailyCompletionRecords() {
        const data = localStorage.getItem(LS_DAILY_COMPLETION_RECORDS);
        return data ? JSON.parse(data) : [];
    }

    // Function to calculate streak
    function calculateStreak(records) {
        if (records.length === 0) return 0;

        // Convert records to Date objects (UTC normalized) and sort
        const dates = records.map(d => {
            const date = new Date(d + 'T00:00:00Z'); // Parse as UTC
            return date;
        }).sort((a, b) => a.getTime() - b.getTime()); // Sort chronologically

        let currentStreak = 0;
        
        // Get today's date and yesterday's date, normalized to UTC start of day
        const now = new Date();
        const todayUTC = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
        const yesterdayUTC = new Date(todayUTC);
        yesterdayUTC.setDate(todayUTC.getDate() - 1);

        // Check if the most recent record is today or yesterday
        const mostRecentRecordDate = dates[dates.length - 1];
        if (mostRecentRecordDate.getTime() === todayUTC.getTime()) {
            currentStreak = 1;
        } else if (mostRecentRecordDate.getTime() === yesterdayUTC.getTime()) {
            currentStreak = 1;
        } else {
            return 0; // Most recent record is not today or yesterday, streak is 0
        }

        // Iterate backwards from the second to last record
        for (let i = dates.length - 2; i >= 0; i--) {
            const currentDate = dates[i];
            const expectedPreviousDay = new Date(dates[i + 1]);
            expectedPreviousDay.setDate(dates[i + 1].getDate() - 1);

            if (currentDate.getTime() === expectedPreviousDay.getTime()) {
                currentStreak++;
            } else {
                break; // Gap found, streak broken
            }
        }
        return currentStreak;
    }

    // Helper function to update a counter with a "pop" animation effect
    function updateAnimatedCounter(element, newValue) {
        if (!element) return;

        const finalValue = String(newValue);
        element.classList.add('updating');
        element.textContent = finalValue;

        // Remove the class after the animation/transition completes
        setTimeout(() => {
            element.classList.remove('updating');
        }, 300); // This duration should match or be slightly longer than the CSS transition
    }

    // Function to update the homepage progress tracker
    function updateHomepageProgressTracker() {
        const currentDayEl = document.getElementById('current-day');
        const streakEl = document.getElementById('streak');
        const totalSolvedEl = document.getElementById('total-solved');
        const remainingDaysEl = document.getElementById('remaining-days');
        const todayProgressEl = document.getElementById('today-progress'); // Reference to the new element
        const partiallySolvedEl = document.getElementById('partially-solved'); // New element reference
        const progressFillEl = document.getElementById('progress-fill');

        // Only run if these elements exist (i.e., we are on index.html)
        if (!currentDayEl || !streakEl || !totalSolvedEl || !remainingDaysEl || !todayProgressEl || !partiallySolvedEl || !progressFillEl) {
            return;
        }

        const solvedChallenges = getSolvedChallengesData();
        const dailyCompletionRecords = getDailyCompletionRecords();

        // Get all unique dates where any challenge was solved.
        const daysWithAnyActivity = new Set();
        Object.values(solvedChallenges).forEach(challenge => {
            const solvedDate = new Date(challenge.solvedTimestamp).toISOString().slice(0, 10); // YYYY-MM-DD format
            daysWithAnyActivity.add(solvedDate);
        });

        const completedDaysCount = dailyCompletionRecords.length;
        const partiallySolvedDaysCount = Math.max(0, daysWithAnyActivity.size - completedDaysCount);

        // Calculate Today's Progress
        const currentDailySetIds = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
        let solvedTodayCount = 0;
        currentDailySetIds.forEach(challengeId => {
            if (solvedChallenges[challengeId] && solvedChallenges[challengeId].wasSolvedInTime) {
                solvedTodayCount++;
            }
        });
        const todayProgressPercentage = ((solvedTodayCount / DAILY_CHALLENGE_COUNT) * 100).toFixed(0);

        // Update content with animation
        updateAnimatedCounter(currentDayEl, completedDaysCount);
        updateAnimatedCounter(streakEl, calculateStreak(dailyCompletionRecords));
        updateAnimatedCounter(totalSolvedEl, Object.keys(solvedChallenges).length);
        updateAnimatedCounter(remainingDaysEl, Math.max(0, 365 - completedDaysCount));
        updateAnimatedCounter(partiallySolvedEl, partiallySolvedDaysCount);
        updateAnimatedCounter(todayProgressEl, `${todayProgressPercentage} %`);

        const progressPercentage = (completedDaysCount / 365) * 100;
        progressFillEl.style.width = `${progressPercentage}%`;
    }

    // Smooth scrolling for navigation links (moved from inline script)
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function (e) {
            e.preventDefault();
            const target = document.querySelector(this.getAttribute('href'));
            if (target) {
                target.scrollIntoView({
                    behavior: 'smooth',
                    block: 'start'
                });
            }
        });
    });

    // Add active class to navigation based on scroll position (moved from inline script)
    window.addEventListener('scroll', function() {
        const sections = document.querySelectorAll('section[id]');
        const navLinks = document.querySelectorAll('nav ul li a');

        let currentSectionId = '';
        sections.forEach(section => {
            const sectionTop = section.offsetTop - document.querySelector('header').offsetHeight; // Adjust for sticky header
            const sectionBottom = sectionTop + section.offsetHeight;
            if (window.scrollY >= sectionTop && window.scrollY < sectionBottom) {
                currentSectionId = section.id;
            }
        });

        navLinks.forEach(link => {
            link.classList.remove('active');
            if (link.getAttribute('href').substring(1) === currentSectionId) {
                link.classList.add('active');
            }
        });
    });

    function getSolvedChallengesData() {
        const data = localStorage.getItem(LS_SOLVED_CHALLENGES);
        return data ? JSON.parse(data) : {};
    }

    // Initial call to update the tracker when the page loads
    updateHomepageProgressTracker();
    // Refresh the tracker every 30 seconds to keep it live
    setInterval(updateHomepageProgressTracker, 5000); // Refresh every 5 seconds
});