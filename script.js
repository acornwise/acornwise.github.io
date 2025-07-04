(function() {
    const original = {
        log: console.log,
        warn: console.warn,
        error: console.error,
    };
    const getTimestamp = () => new Date().toISOString();
    console.log = (...args) => original.log.apply(console, [`[${getTimestamp()}]`, ...args]);
    console.warn = (...args) => original.warn.apply(console, [`[${getTimestamp()}] [WARN]`, ...args]);
    console.error = (...args) => original.error.apply(console, [`[${getTimestamp()}] [ERROR]`, ...args]);
})();

let editor;
let pyodide;
let currentChallengeData = null;
let markedModule;
let typeListener;
let timerInterval;
let initialChallengeDuration;
let currentRemainingTime;
let timerRunning = false;
let startTime;

const VERSION = '8';
const LS_APP_VERSION = 'acornwise_appVersion';
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

let previousViewBeforeReport = 'daily'; // To store which view was active before showing the report

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

    const storedVersion = localStorage.getItem(LS_APP_VERSION);
    if (storedVersion !== VERSION) {
        console.log(`Version mismatch. Stored: ${storedVersion}, Current: ${VERSION}. Flushing question cache.`);
        
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key.startsWith(LS_QUESTION_FILE_CACHE_PREFIX) || key === LS_ALL_METADATA_CACHE) {
                keysToRemove.push(key);
            }
        }

        keysToRemove.forEach(key => {
            localStorage.removeItem(key);
            console.log(`Removed cached item: ${key}`);
        });

        localStorage.setItem(LS_APP_VERSION, VERSION);
        console.log(`Cache flushed and version updated to ${VERSION}.`);
    }

    const runButton = document.getElementById('run-code-btn');
    const pyodideStatus = document.getElementById('pyodide-status');
    const resultsOutput = document.getElementById('results-output');
    const descriptionArea = document.getElementById('description-area');
    const testCasesArea = document.getElementById('test-cases-area');
    const challengeNavigation = document.getElementById('challenge-navigation'); // Get navigation element
    const timerDisplay = document.getElementById('timer-display');    
    const reportContentArea = document.getElementById('report-content-area');
    const retryChallengeBtn = document.getElementById('retry-challenge-btn');    
    const skipChallengeBtn = document.getElementById('skip-challenge-btn');    
    const mainContentArea = document.querySelector('main'); // The main IDE area
    const loadingTaskText = document.getElementById('pyodide-status');
    const loadingProgressBar = document.getElementById('loading-progress-bar');

    // Remove hash on initial page load if present
    if (window.location.hash) {
        history.replaceState(null, '', window.location.pathname + window.location.search);
        console.log("URL hash removed on initial load. Daily challenge view will be shown.");
    }

    function updateLoadingProgress(task, percentage) {
        if (loadingTaskText) {
            loadingTaskText.textContent = task;
        }
        if (loadingProgressBar) {
            loadingProgressBar.style.width = `${percentage}%`;
        }
    }

    // Helper function to create and load an AdSense ad unit
    function createAndLoadAd(containerId, adSlotId, width, height) {
        const container = document.getElementById(containerId);
        if (!container) {
            console.warn(`Ad container with ID '${containerId}' not found.`);
            return;
        }

        // Clear any existing ad content in the container
        container.innerHTML = '';

        const ins = document.createElement('ins');
        ins.className = 'adsbygoogle';
        ins.style.display = 'inline-block';
        ins.style.width = `${width}px`;
        ins.style.height = `${height}px`;
        ins.setAttribute('data-ad-client', 'ca-pub-7669371125149782');
        ins.setAttribute('data-ad-slot', adSlotId);
        container.appendChild(ins);

        (window.adsbygoogle = window.adsbygoogle || []).push({});
    }

    function initializeAdsInContainer(containerElement) {
        if (!containerElement || typeof adsbygoogle === 'undefined') {
            console.warn("AdSense script not ready or container not found for ad initialization.");
            return;
        }
        const adSlots = containerElement.querySelectorAll('ins.adsbygoogle');
        adSlots.forEach(slot => {
            if (slot.getAttribute('data-ad-status') !== 'initialized') {
                let retries = 0;
                const maxRetries = 10; // Try for a maximum of 50 seconds (10 retries * 5 seconds)
                const intervalTime = 5000; // 5 seconds

                function attemptAdPush() {
                    if (slot.getAttribute('data-ad-status') === 'initialized') {
                        return; // Already initialized by another check or previous attempt
                    }

                    requestAnimationFrame(() => { // Ensure check happens in sync with browser rendering
                        try {
                            if (slot.offsetWidth > 0) {
                                (adsbygoogle = window.adsbygoogle || []).push({});
                                slot.setAttribute('data-ad-status', 'initialized');
                                console.log("AdSense initialized:", slot);
                            } else if (retries < maxRetries) {
                                retries++;
                                console.warn(`Ad slot still has 0 width. Retry ${retries}/${maxRetries} in ${intervalTime/1000}s for slot:`, slot);
                                setTimeout(attemptAdPush, intervalTime);
                            } else {
                                console.error(`Ad slot still has 0 width after ${maxRetries} retries. Giving up for slot:`, slot);
                            }
                        } catch (e) {
                            console.error('AdSense push error:', e, slot);
                            // Optionally, you might want to stop retrying on certain errors
                        }
                    });
                }

                // Initial attempt
                attemptAdPush();
            }
        });
    }

    // --- Pyodide Initialization ---
    async function initializePyodide() {
        try {
            pyodideStatus.textContent = "Loading Pyodide (this may take a moment)...";
            runButton.disabled = true;

            pyodide = await loadPyodide();
            pyodideStatus.textContent = "Pyodide ready.";
            runButton.disabled = false;
            console.log("Pyodide loaded and ready.");
        } catch (error) {
            pyodideStatus.textContent = `Failed to load Pyodide: ${error.message}`;
            console.error("Error loading Pyodide:", error);
        }
    }

    // --- Monaco Editor Initialization ---
    require.config({
        paths: {
            'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.48.0/min/vs',
            'marked': 'https://cdnjs.cloudflare.com/ajax/libs/marked/12.0.2/marked.min'
        }
    });

    // Make the require callback async to use await inside
    require(['vs/editor/editor.main', 'marked'], async function(_, loadedMarked) {
        updateLoadingProgress("Configuring Code Editor...", 10);
        markedModule = loadedMarked;
        editor = monaco.editor.create(document.getElementById('code-editor'), {
            value: [
                '# Write your Python code here',
                'def solve():',
                '    print("Hello from Python!")',
                '    print(f"Current year: {2025}")',
                '',
                '# Call your function to see output',
                'solve()'
            ].join('\n'),
            language: 'python',
            lineNumbers: 'on',
            automaticLayout: true,
        });

        console.log("Monaco Editor loaded and configured for Python.");

        // Save editor content to localStorage on change
        editor.onDidChangeModelContent(() => {
            if (editor && currentChallengeData && currentChallengeData.id) {
                const userCode = editor.getValue();
                const editorContentKey = `${LS_EDITOR_CONTENT_PREFIX}${currentChallengeData.id}`;
                localStorage.setItem(editorContentKey, userCode);
            }
        });

        updateLoadingProgress("Initializing Python Environment...", 25);

        await initializePyodide();

        updateLoadingProgress("Preparing Today's Workout...", 75);
        await manageDailyChallengeSelection();
        
        updateLoadingProgress("Fetching Challenge List...", 85);
        await loadChallengeList();

        updateLoadingProgress("Finalizing Setup...", 95);
        updateLoadingProgress("Pyodide loaded and ready.", 100);

        // TODO
        const currentDailySet = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
        const solvedChallenges = getSolvedChallengesData();
        let loadTargetId = undefined;


        for (let i = 0; i < currentDailySet.length; i++) {
            const challengeId = currentDailySet[i];
            if (!solvedChallenges[challengeId]) {
                loadTargetId = challengeId;
                break;
            }
        }

        if (!loadTargetId) {
            loadTargetId = currentDailySet[0];
        }

        await loadChallenge(loadTargetId);
    });
    

    async function runSingleTest(testCase, userCode, resultDiv, inputType, functionName) {
        resultDiv.textContent = 'Running...';
        resultDiv.classList.remove('pass', 'fail');
        resultDiv.classList.add('running');

        let passed = false;
        let capturedStdout = "";

        pyodide.setStdout({
            batched: (msg) => {
                capturedStdout += msg + '\n';
            }
        });

        pyodide.setStderr({
            batched: (msg) => {
                capturedStdout += `ERROR (stderr): ${msg}\n`;
            }
        });

        try {
            if (inputType === "stdin") {
                const currentInputLines = Array.isArray(testCase.input) ?
                                          testCase.input.map(item => String(item).trim()) :
                                          String(testCase.input).split('\n').map(item => item.trim());

                let inputLineIndex = 0;

                pyodide.setStdin({
                    stdin: () => {
                        if (inputLineIndex < currentInputLines.length) {
                            return currentInputLines[inputLineIndex++] + '\n';
                        } else {
                            throw new pyodide.ffi.PythonError("EOFError: No more test inputs available");
                        }
                    }
                });

                await pyodide.runPythonAsync(userCode);
                
                if (capturedStdout.trim().length == 0) {
                    console.log('Try to flush outputs ..');
                    await pyodide.runPythonAsync('print()');
                }

                const actualOutput = capturedStdout.trim();
                const expectedOutput = String(testCase.expected_output).trim();

                if (actualOutput === expectedOutput) {
                    resultDiv.textContent = `PASS`;
                    resultDiv.classList.add('pass');
                    passed = true;
                } else {
                    resultDiv.textContent = `FAIL (Expected: "${expectedOutput}", Got: "${actualOutput}")`;
                    resultDiv.classList.add('fail');
                }

            } else if (inputType === "function") {
                if (!functionName) {
                    throw new Error("Function name is not defined for 'function' input type.");
                }
                await pyodide.runPythonAsync(`import json`); // Ensure json module is available
                let test_case_inputs = [];

                // Iterate through each input argument provided in the test case
                for (const test_input_str of testCase.input) {
                    try {
                        // Attempt to parse the string as JSON. This handles numbers, booleans,
                        // and JSON-formatted arrays/objects (like "[1, 2, 3]" or "true").
                        const parsed = JSON.parse(test_input_str);
                        test_case_inputs.push(parsed);
                    } catch (e) {
                        // If JSON.parse fails, it means the input is a literal string
                        // that is not a valid JSON (e.g., "hello", "+"). Push it as is.
                        test_case_inputs.push(test_input_str);
                    }
                }

                const pythonInputArgs = JSON.stringify(test_case_inputs);

                const codeToExecute = `
${userCode.trim()}

# Test harness code for function call
_input_args = json.loads('${pythonInputArgs}')
try:
    _actual_output_func_call = ${functionName}(*_input_args)
except Exception as e:
    _actual_output_func_call = f"ERROR: {e}"
`.trim(); // Trim the entire template literal to remove any accidental leading/trailing newlines/spaces
                await pyodide.runPythonAsync(codeToExecute);

                // Retrieve the Python output and convert it to a JavaScript type
                const pyProxyOutput = pyodide.globals.get('_actual_output_func_call');
                let actualOutputString;

                if (pyProxyOutput && typeof pyProxyOutput.toJs === 'function') {
                    const jsOutput = pyProxyOutput.toJs({ dict_converter: Object.fromEntries }); // Convert PyProxy to JS native types
                    if (Array.isArray(jsOutput)) {
                        actualOutputString = jsOutput.join(' '); // Join array elements with space for comparison
                    } else if (typeof jsOutput === 'boolean') {
                        actualOutputString = jsOutput ? 'True' : 'False'; // Python booleans are 'True'/'False'
                    } else {
                        actualOutputString = String(jsOutput); // Convert other types to string
                    }
                    pyProxyOutput.destroy(); // Clean up the PyProxy object
                } else {
                    actualOutputString = String(pyProxyOutput); // Fallback for non-PyProxy or error cases
                }

                const expectedOutputString = String(testCase.expected_output).trim();

                if (actualOutputString.trim() === expectedOutputString) {
                    resultDiv.textContent = `PASS`;
                    resultDiv.classList.add('pass');
                    passed = true;
                } else {
                    resultDiv.textContent = `FAIL (Expected: "${expectedOutputString}", Got: "${actualOutputString}")`;
                    resultDiv.classList.add('fail');
                }

            } else if (inputType === "file_read") {
                const inputFilename = testCase.input_filename || currentChallengeData.input_filename;

                if (!inputFilename) {
                    throw new Error("Challenge input_filename is not defined for 'file_read' input type in challenge data.");
                }
                const inputFileContent = testCase.input_file_content || testCase.input;
                
                const dirname = inputFilename.substring(0, inputFilename.lastIndexOf('/'));
                if (dirname && dirname !== '.' && dirname !== '..') {
                    try {
                        pyodide.FS.mkdir(dirname);
                    } catch (e) {
                        if (!e.message.includes("File exists")) {
                            throw e;
                        }
                    }
                }
                pyodide.FS.writeFile(inputFilename, inputFileContent, { encoding: "utf8" });

                await pyodide.runPythonAsync(userCode);

                const actualOutput = capturedStdout.trim();
                const expectedOutput = String(testCase.expected_output).trim();

                if (actualOutput === expectedOutput) {
                    resultDiv.textContent = `PASS`;
                    resultDiv.classList.add('pass');
                    passed = true;
                } else {
                    resultDiv.textContent = `FAIL (Expected: "${expectedOutput}", Got: "${actualOutput}")`;
                    resultDiv.classList.add('fail');
                }

                pyodide.FS.unlink(inputFilename);

            } else if (inputType === "file_io") {
                const inputFilename = testCase.input_filename || currentChallengeData.input_filename;

                if (!inputFilename) {
                    throw new Error("Challenge input_filename is not defined for 'file_io' input type in challenge data.");
                }
                const inputFileContent = testCase.input_file_content || testCase.input;
                const outputFilename = testCase.output_filename || currentChallengeData.output_filename;

                if (!outputFilename) {
                    throw new Error("Challenge output_filename is not defined for 'file_io' input type in challenge data.");
                }

                const inputDirname = inputFilename.substring(0, inputFilename.lastIndexOf('/'));
                if (inputDirname && inputDirname !== '.' && inputDirname !== '..') {
                    try {
                        pyodide.FS.mkdir(inputDirname);
                    } catch (e) {
                        if (!e.message.includes("File exists")) {
                            throw e;
                        }
                    }
                }
                pyodide.FS.writeFile(inputFilename, inputFileContent, { encoding: "utf8" });

                await pyodide.runPythonAsync(userCode);

                let actualFileContent = '';
                try {
                    actualFileContent = pyodide.FS.readFile(outputFilename, { encoding: "utf8" }).trim();
                } catch (readError) {
                    throw new Error(`Output file '${outputFilename}' not found or could not be read: ${readError.message}\n${capturedStdout.trim()}`);
                }

                const expectedOutput = String(testCase.expected_output).trim();

                if (actualFileContent === expectedOutput) {
                    resultDiv.textContent = `PASS`;
                    resultDiv.classList.add('pass');
                    passed = true;
                } else {
                    resultDiv.textContent = `FAIL (Expected: "${expectedOutput}", Got: "${actualFileContent}")`;
                    resultDiv.classList.add('fail');
                }

                pyodide.FS.unlink(inputFilename);
                try {
                    pyodide.FS.unlink(outputFilename);
                } catch (e) { /* ignore if not created */ }

            } else {
                throw new Error(`Unknown input_type: ${inputType}`);
            }

        } catch (error) {
            resultDiv.textContent = `ERROR: ${error.message}`;
            resultDiv.classList.add('fail');
            console.error(`Error running test case:`, error);
        } finally {
            resultDiv.classList.remove('running');

            pyodide.setStdin({
                stdin: () => {
                    throw new pyodide.ffi.PythonError("EOFError: No more input available (reset)");
                }
            });
            pyodide.setStdout({});
            pyodide.setStderr({});
        }
        return passed;
    }

    function extractFunctionName(starterCode) {
        if (!starterCode) return null;
        // Regex to find "def function_name(" or "def function_name ("
        const match = starterCode.match(/def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/);
        if (match && match[1]) {
            return match[1];
        }
        return null; // Or throw an error if a function name is expected but not found
    }

    runButton.addEventListener('click', async () => {
        if (!pyodide || !currentChallengeData) {
            resultsOutput.textContent = "Error: Pyodide not loaded or no challenge selected.";
            return;
        }

        // Scroll to the test cases section
        if (testCasesArea) {
            document.querySelector('.test-cases-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
        }        

        const userCode = editor.getValue();
        resultsOutput.textContent = "Running tests...";
        runButton.disabled = true;

        document.querySelectorAll('.test-case-result').forEach(div => {
            div.textContent = '';
            div.className = 'test-case-result';
        });

        const testCases = currentChallengeData.test_cases;
        let overallPass = true;

        for (let i = 0; i < testCases.length; i++) {
            const testCase = testCases[i];
            const testCaseResultDiv = document.getElementById(`test-case-result-${i}`);
            const passedThisTest = await runSingleTest(
                testCase,
                userCode,
                testCaseResultDiv,
                currentChallengeData.input_type,
                currentChallengeData.input_type === "function" ? extractFunctionName(currentChallengeData.starter_code) : null
            );
            if (!passedThisTest) {
                overallPass = false;
            }
        }

        resultsOutput.textContent = `All tests completed. Overall: ${overallPass ? 'PASS' : 'FAIL'}`;
        runButton.disabled = false;

        if (overallPass) {
            console.log(`[DEBUG] overallPass is true for challenge ${currentChallengeData.id}. Attempting to add tick.`);
            stopTimer();

            const timeTakenSeconds = initialChallengeDuration - currentRemainingTime;
            const wasSolvedInTime = timeTakenSeconds <= initialChallengeDuration;
            
            markChallengeSolved(
                currentChallengeData.id,
                currentChallengeData.title,
                currentChallengeData.level,
                currentChallengeData.category,
                timeTakenSeconds,
                initialChallengeDuration,
                wasSolvedInTime
            );

            localStorage.removeItem(`challengeTimer_${currentChallengeData.id}`);            
            updateUIAfterPass();
            const currentLink = document.querySelector(`.challenge-link[data-challenge-id="${currentChallengeData.id}"]`);

            if (currentLink) {
                console.log(`[DEBUG] currentLink found for ${currentChallengeData.id}:`, currentLink);
                currentLink.classList.add('passed');
                const existingTick = currentLink.querySelector('.tick-mark');
                if (!existingTick) {
                    console.log(`[DEBUG] No existing tick found. Creating and prepending new tick for ${currentChallengeData.id}.`);
                    const tickSpan = document.createElement('span');
                    tickSpan.classList.add('tick-mark');
                    tickSpan.innerHTML = '&#10003;';
                    currentLink.prepend(tickSpan);
                    console.log(`Tick successfully prepended to challenge ${currentChallengeData.id}.`);
                } else {
                    console.log(`[DEBUG] Tick already exists for challenge ${currentChallengeData.id}. Existing tick element:`, existingTick);
                }
            } else {
                console.warn(`[DEBUG] Could not find challenge link for ID: ${currentChallengeData.id} when trying to add tick.`);
            }
        }
    });

    function updateUIAfterPass() {
        timerDisplay.textContent = "Challenge Passed!";
        timerDisplay.classList.remove('timer-red', 'timer-green');
        retryChallengeBtn.style.display = 'inline-block';
        skipChallengeBtn.style.display = 'none';
        runButton.style.display = 'none';        
    }

    function startTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
        }
        timerRunning = true;
        startTime = Date.now();

        updateTimerDisplay();
        timerInterval = setInterval(updateTimer, 1000);
    }

    function updateTimerDisplay() {
        const displayTime = Math.max(0, currentRemainingTime);
        let timeText = formatTime(displayTime);

        if (currentRemainingTime < 0) {
            timerDisplay.classList.add('timer-red');
            timerDisplay.classList.remove('timer-green');
            timeText = `Overtime: ${formatTime(Math.abs(currentRemainingTime))}`;
        } else {
            timerDisplay.classList.add('timer-green');
            timerDisplay.classList.remove('timer-red');
        }
        timerDisplay.textContent = timeText;
    }    

    function stopTimer() {
        if (timerInterval) {
            clearInterval(timerInterval);
            timerInterval = null;
        }
        timerRunning = false;
    }

    function updateTimer() {
        if (!timerRunning) return;

        const elapsedTimeSinceStart = Math.floor((Date.now() - startTime) / 1000);
        currentRemainingTime = initialChallengeDuration - elapsedTimeSinceStart;

        const displayTime = Math.max(0, currentRemainingTime);
        timerDisplay.textContent = formatTime(displayTime);

        if (currentRemainingTime < 0) {
            timerDisplay.classList.add('timer-red');
            timerDisplay.classList.remove('timer-green');
            timerDisplay.textContent = `Overtime: ${formatTime(Math.abs(currentRemainingTime))}`;
        } else {
            timerDisplay.classList.add('timer-green');
            timerDisplay.classList.remove('timer-red');
        }

        // Save timer progress if the challenge is not yet solved in time
        const solvedDataForTimer = getSolvedChallengeData(currentChallengeData?.id);
        if (currentChallengeData && (!solvedDataForTimer || !solvedDataForTimer.wasSolvedInTime)) {
            localStorage.setItem(`challengeTimer_${currentChallengeData.id}`, JSON.stringify({
                remainingTime: currentRemainingTime,
                timestamp: Date.now()
            }));
        }
    }

    function formatTime(seconds) {
        const absSeconds = Math.abs(seconds);
        const minutes = Math.floor(absSeconds / 60);
        const remainingSeconds = absSeconds % 60;
        const formattedMinutes = String(minutes).padStart(2, '0');
        const formattedSeconds = String(remainingSeconds).padStart(2, '0');
        return `${formattedMinutes}:${formattedSeconds}`;
    }

    async function loadChallenge(challengeId) {
        console.log(`Loading challenge: ${challengeId}`);
        stopTimer();
        if (typeListener) {
            typeListener.dispose();
        }

        // Clear previous challenge data immediately
        currentChallengeData = null; 

        descriptionArea.innerHTML = '<p>Loading challenge details...</p>';
        testCasesArea.innerHTML = '<p>Loading test cases...</p>';
        resultsOutput.textContent = '';

        if (editor) {
            editor.setValue("# Loading challenge...\n");
        }

        runButton.disabled = true;

        document.querySelectorAll('.challenge-link').forEach(link => {
            link.classList.remove('active');
            if (link.dataset.challengeId === challengeId) {
                link.classList.add('active');
            }
        });

        try {
            currentChallengeData = await getQuestion(challengeId);
            const challengeData = currentChallengeData;
            currentChallengeData.category = currentChallengeData.category || "General";

            if (!markedModule) {
                console.error("Marked.js module not loaded. Cannot render description.");
                descriptionArea.innerHTML = `<p style="color: red;">Error: Markdown parser not ready.</p>`;
            } else {
                const renderedDescription = markedModule.parse(challengeData.description_md, { breaks: true });
                descriptionArea.innerHTML = `<h3>${challengeData.title}</h3><div>${renderedDescription}</div>`;
            }

            // Load editor content from localStorage if available, otherwise use starter_code
            if (editor) {
                const editorContentKey = `${LS_EDITOR_CONTENT_PREFIX}${challengeId}`;
                const savedEditorContent = localStorage.getItem(editorContentKey);
                if (savedEditorContent !== null) {
                    editor.setValue(savedEditorContent);
                } else {
                    editor.setValue((challengeData.starter_code || "") + "\n");
                }
            }
            runButton.disabled = false;

            testCasesArea.innerHTML = '';
            const testCaseList = document.createElement('ul');
            testCaseList.classList.add('test-case-list');

            challengeData.test_cases.forEach((testCase, index) => {
                const listItem = document.createElement('li');
                listItem.classList.add('test-case-item');

                let inputContentHtml = '';                
                let expectedOutputHtml = '';
                const outputValue = testCase.expected_output;

                if (challengeData.input_type === "stdin") {
                    // Ensure testCase.input is an array for display.
                    // If it's a string, wrap it in an array. If null/undefined, treat as empty array.
                    const inputForDisplay = Array.isArray(testCase.input) ? testCase.input : (testCase.input != null ? [String(testCase.input)] : []);
                    inputContentHtml = inputForDisplay.map(line => `<i>${line}</i>`).join('<br>');
                } else if (challengeData.input_type === "function") {
                    inputContentHtml = `<code>${JSON.stringify(testCase.input)}</code>`;
                } else if (challengeData.input_type === "file_read") {
                    const contentSnippet = testCase.input_file_content.substring(0, 100);
                    inputContentHtml = `File: <code>${testCase.input_filename}</code><br>Content: <i>"${contentSnippet}${testCase.input_file_content.length > 100 ? '...' : ''}"</i>`;
                } else if (challengeData.input_type === "file_io") { // Display for file_io
                    const inputContentSnippet = testCase.input_file_content.substring(0, 100);
                    inputContentHtml = `Input File: <code>${testCase.input_filename}</code><br>Content: <i>"${inputContentSnippet}${testCase.input_file_content.length > 100 ? '...' : ''}"</i>`;
                    const expectedOutputSnippet = String(testCase.expected_output).substring(0, 100);
                    expectedOutputHtml = `Output File: <code>${testCase.output_filename}</code><br>Expected Content: <i>"${expectedOutputSnippet}${String(testCase.expected_output).length > 100 ? '...' : ''}"</i>`;
                } else {
                    inputContentHtml = 'N/A';
                    expectedOutputHtml = 'N/A';
                }

                if (typeof outputValue === 'string') {
                    const tempDiv = document.createElement('div');
                    tempDiv.textContent = outputValue; // Handles HTML escaping, preserves \n
                    expectedOutputHtml = `<code>${tempDiv.innerHTML}</code>`;
                } else {
                    // For non-strings (arrays, objects, numbers, booleans), JSON.stringify is good.
                    expectedOutputHtml = `<code>${JSON.stringify(outputValue, null, 2)}</code>`;
                }


                listItem.innerHTML = `
                    <h4>Test Case ${index + 1}</h4>
                    <p><strong>Input Type:</strong> <code>${challengeData.input_type}</code></p>
                    <p><strong>Input:</strong><br>${inputContentHtml}</p>
                    <p><strong>Expected Output:</strong><br>${expectedOutputHtml}</p>
                    <div class="test-case-result" id="test-case-result-${index}"></div>
                `;
                testCaseList.appendChild(listItem);
            });
            testCasesArea.appendChild(testCaseList);

            const level = currentChallengeData.level ? currentChallengeData.level.toLowerCase() : 'easy';
            if (level === 'easy') {
                initialChallengeDuration = 4 * 60 + 10; // 4 minutes 10 seconds
            } else if (level === 'medium') {
                initialChallengeDuration = 8 * 60 + 20; // 8 minutes 20 seconds
            } else {
                initialChallengeDuration = 4 * 60 + 10; // Default to easy
            }

            localStorage.removeItem(`challengeTimer_${challengeId}`);
            currentRemainingTime = initialChallengeDuration;

            const solvedData = getSolvedChallengeData(challengeId);
            if (solvedData) {
                updateUIAfterPass();
            } else {
                retryChallengeBtn.style.display = 'none';
                skipChallengeBtn.style.display = 'inline-block';
                runButton.style.display = 'inline-block'; 

                timerDisplay.textContent = formatTime(initialChallengeDuration);
                timerDisplay.classList.remove('timer-red', 'timer-green');

                typeListener = editor.onDidType(() => {
                    if (!timerRunning) {
                        console.log("First keypress detected, starting timer.");
                        startTimer();
                    }

                    typeListener.dispose();
                });                
            }

        } catch (error) {
            console.error('Error loading challenge:', error);
            descriptionArea.innerHTML = `<p style="color: red;">Failed to load challenge ${challengeId}. Error: ${error.message}</p>`;
            testCasesArea.innerHTML = `<p style="color: red;">Test cases could not be loaded.</p>`;
            runButton.disabled = true;
            timerDisplay.textContent = "Timer Error";
            timerDisplay.classList.remove('timer-red', 'timer-green');
        }
    }

    // Cache for challenges.json content
    let challengesManifest = null;

    async function getQuestion(challengeId) {
        try {
            if (!challengesManifest) {
                const manifestResponse = await fetch('./challenges.json');
                if (!manifestResponse.ok) {
                    throw new Error(`Failed to load challenges.json: ${manifestResponse.status}`);
                }
                challengesManifest = await manifestResponse.json();
            }

            const challengeInfo = challengesManifest.find(ch => ch.id === challengeId);
            if (!challengeInfo) {
                throw new Error(`Challenge ID "${challengeId}" not found in challenges.json manifest.`);
            }
            const fileName = challengeInfo.file;
            const fileCacheKey = `${LS_QUESTION_FILE_CACHE_PREFIX}${fileName}`;

            let fileContent; // This will hold the parsed JSON content of the file
            const cachedFileContentString = localStorage.getItem(fileCacheKey);

            if (cachedFileContentString) {
                console.log(`[CACHE HIT] Loading question file content for "${fileName}" from localStorage.`);
                try {
                    fileContent = JSON.parse(cachedFileContentString);
                } catch (e) {
                    console.error(`Error parsing cached content for ${fileName}. Removing from cache and fetching from network.`, e);
                    localStorage.removeItem(fileCacheKey);
                    // Fall through to fetch from network if parsing failed
                }
            }

            if (!fileContent) { // If not in cache or parsing failed
                console.log(`[CACHE MISS] Fetching question file "${fileName}" from network.`);
                const response = await fetch(`./${fileName}`); // Assuming fileName is relative to index.html
                if (!response.ok) {
                    throw new Error(`Failed to load question file "${fileName}": ${response.status}`);
                }
                fileContent = await response.json();
                try {
                    localStorage.setItem(fileCacheKey, JSON.stringify(fileContent));
                } catch (e) {
                    console.error(`Error saving file content for "${fileName}" to localStorage. May be out of space.`, e);
                    // Proceed without caching if localStorage is full or errors out
                }
            }

            // Now, extract the specific challenge data from the (potentially cached) fileContent
            let specificChallengeData;
            if (Array.isArray(fileContent)) {
                specificChallengeData = fileContent.find(ch => ch.id === challengeId);
            } else if (typeof fileContent === 'object' && fileContent !== null && fileContent.id === challengeId) {
                // Handles case where the file contains a single challenge object that matches the ID
                specificChallengeData = fileContent;
            }

            if (!specificChallengeData) {
                throw new Error(`Challenge data for ID "${challengeId}" not found within the content of file "${fileName}".`);
            }
            return specificChallengeData;

        }  catch (error) {
            console.error(`Error in getQuestion for ID "${challengeId}":`, error);
            return null;
        }
    }

    async function loadChallengeList() {
        try {
            const dailySetIdsString = localStorage.getItem(LS_CURRENT_DAILY_SET);
            if (!dailySetIdsString) {
                challengeNavigation.innerHTML = '<p>No daily challenges selected yet.</p>';
                console.warn("No daily challenge set found in localStorage for sidebar.");
                return;
            }
            const dailyChallengeIds = JSON.parse(dailySetIdsString).map(id => ({ id })); // Ensure format [{id: "1"}, {id: "2"}]


            challengeNavigation.innerHTML = '';
            const ul = document.createElement('ul');

            const challengePromises = dailyChallengeIds.map(async (item) => {                
                const challengeId = item.id;
                const challengeData = await getQuestion(challengeId);
                if (challengeData && challengeData.title) {
                    return { id: challengeId, title: challengeData.title };
                }
                console.warn(`Could not retrieve title for challenge ID ${challengeId} for sidebar. Challenge data:`, challengeData);
                return null; // Return null if data or title is missing
            });

            const resolvedChallenges = await Promise.all(challengePromises);
            const challengesWithTitles = resolvedChallenges.filter(challenge => challenge !== null);
            
            challengesWithTitles.forEach(challenge => {
                const li = document.createElement('li');
                const a = document.createElement('a');

                a.dataset.challengeId = challenge.id;
                a.classList.add('challenge-link');
                a.href = `#${challenge.id}`;

                const solvedData = getSolvedChallengeData(challenge.id);
                if (solvedData) {
                    if (solvedData?.wasSolvedInTime) {
                        a.classList.add('passed');
                        const tickSpan = document.createElement('span');
                        tickSpan.classList.add('tick-mark');
                        tickSpan.innerHTML = '&#10003;&nbsp;';
                        a.appendChild(tickSpan);
                    } else {
                        a.classList.add('passed');
                        const tickSpan = document.createElement('span');
                        tickSpan.classList.add('tick-mark-overtime');
                        tickSpan.innerHTML = '&#10003;&nbsp;';
                        a.appendChild(tickSpan);
                    }
                } else {
                    a.classList.add('passed');
                    const tickSpan = document.createElement('span');
                    tickSpan.classList.add('tick-mark-overtime');
                    tickSpan.innerHTML = '&#x1F5F8;&nbsp;';
                    a.appendChild(tickSpan);                    
                }

                const titleSpan = document.createElement('span');
                titleSpan.textContent = challenge.title;
                titleSpan.classList.add('challenge-title-text');
                a.appendChild(titleSpan);

                li.appendChild(a);
                ul.appendChild(li);
            });
            challengeNavigation.appendChild(ul);
        } catch (error) {
            console.error('Error loading challenge list:', error);
            challengeNavigation.innerHTML = `<p style="color: red;">Failed to load challenges.</p>`;
        }
    }

    window.addEventListener('hashchange', () => {
        const challengeId = window.location.hash.substring(1);
        if (challengeId) {
            loadChallenge(challengeId);
        } else if (mainContentArea.style.display !== 'none') {
            mainContentArea.style.display = 'none';
            manageDailyChallengeSelection(); 
        }            
    });

    function getSolvedChallengesData() {
        const data = localStorage.getItem(LS_SOLVED_CHALLENGES);
        return data ? JSON.parse(data) : {};
    }

    function getSolvedChallengeData(challengeId) {
        const allSolved = getSolvedChallengesData();
        return allSolved[challengeId];
    }

    function markChallengeSolved(id, title, level, category, timeTakenSeconds, initialDurationSeconds, wasSolvedInTime) {
        const solvedChallenges = getSolvedChallengesData();
        solvedChallenges[id] = {
            id,
            title,
            level,
            category: category || "General",
            solvedTimestamp: Date.now(),
            timeTakenSeconds,
            initialDurationSeconds,
            wasSolvedInTime
        };
        localStorage.setItem(LS_SOLVED_CHALLENGES, JSON.stringify(solvedChallenges));

        const dailySetList = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET));
        let solvedCount = 0

        for (const challengeId of dailySetList) {
            if (solvedChallenges[challengeId] !== undefined) {
                solvedCount++;
            }
        }

        if (solvedCount == DAILY_CHALLENGE_COUNT) {
            let completionList = localStorage.getItem(LS_DAILY_COMPLETION_RECORDS) || '[]';
            completionList = JSON.parse(completionList);
            
            const todayDateString = new Date().toLocaleDateString('en-CA'); // YYYY-MM-DD format
            if (!completionList.includes(todayDateString)) {
                completionList.push(todayDateString);
            }
 
            localStorage.setItem(LS_DAILY_COMPLETION_RECORDS, JSON.stringify(completionList));
        }

        updateHomepageProgressTracker();
    }

    function isTimeForNewDailySelection() {
        const lastSelectionTimestamp = parseInt(localStorage.getItem(LS_LAST_DAILY_SELECTION_TIMESTAMP), 10);
        if (!lastSelectionTimestamp) return true; // First time
        return (Date.now() - lastSelectionTimestamp) >= TWENTY_FOUR_HOURS_MS;
    }

    async function selectNewDailyChallenges() {
        const allChallengesMeta = await getAllChallengeMetadata(); // id, title, level, category
        const solvedChallengesData = getSolvedChallengesData();
        let currentDailySet = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');

        let newDailySet = [];

        for (const prevId of currentDailySet) {
            const solvedData = solvedChallengesData[prevId];
            if (!solvedData || !solvedData.wasSolvedInTime) {
                if (newDailySet.length < DAILY_CHALLENGE_COUNT) {
                    const challengeMeta = allChallengesMeta.find(c => c.id === prevId);
                    if (challengeMeta) newDailySet.push(challengeMeta);
                }
            }
        }

        const availableChallenges = allChallengesMeta.filter(challenge => {
            if (newDailySet.find(c => c.id === challenge.id)) return false;

            const solvedData = solvedChallengesData[challenge.id];
            if (solvedData && solvedData.wasSolvedInTime) {
                return (Date.now() - solvedData.solvedTimestamp) >= ONE_YEAR_MS;
            }
            return true;
        });

        while (newDailySet.length < DAILY_CHALLENGE_COUNT && availableChallenges.length > 0) {
            const randomIndex = Math.floor(Math.random() * availableChallenges.length);
            const selected = availableChallenges.splice(randomIndex, 1)[0]; // Remove from available
            newDailySet.push(selected);
        }

        localStorage.setItem(LS_CURRENT_DAILY_SET, JSON.stringify(newDailySet.map(c => c.id)));
        localStorage.setItem(LS_LAST_DAILY_SELECTION_TIMESTAMP, Date.now().toString());
        return newDailySet;
    }

    async function manageDailyChallengeSelection() {
        if (isTimeForNewDailySelection()) {
            console.log("Time for new daily selection or first time.");
            currentDailySetMeta = await selectNewDailyChallenges();
        } else {
            const dailySetIds = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
            const allMeta = await getAllChallengeMetadata();
            currentDailySetMeta = dailySetIds.map(id => allMeta.find(m => m.id === id)).filter(Boolean);
        }
    }

    async function handleSkipChallenge(challengeIdToSkip) {
        console.log(`Attempting to skip challenge: ${challengeIdToSkip}`);
        updateLoadingProgress("Finding a new challenge...", 0); // Show immediate feedback

        let currentDailySetIds = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
        if (!currentDailySetIds.includes(challengeIdToSkip)) {
            console.warn("Challenge to skip not found in current daily set.");
            alert("Error: Could not find the challenge to skip in the current set.");
            updateLoadingProgress("Idle", 0); // Reset progress
            return;
        }

        const allChallengesMeta = await getAllChallengeMetadata();
        const solvedChallengesData = getSolvedChallengesData();

        const potentialReplacements = allChallengesMeta.filter(challenge => {
            if (currentDailySetIds.includes(challenge.id) && challenge.id !== challengeIdToSkip) return false; // Already in set (and not the one being skipped)
            if (challenge.id === challengeIdToSkip) return false; // Don't pick the same one

            const solvedData = solvedChallengesData[challenge.id];
            if (solvedData && solvedData.wasSolvedInTime) {
                return (Date.now() - solvedData.solvedTimestamp) >= ONE_YEAR_MS;
            }
            return true;
        });

        if (potentialReplacements.length === 0) {
            alert("No more eligible challenges available to swap with at the moment. Try again later or solve the current ones!");
            updateLoadingProgress("Idle", 0); // Reset progress
            return;
        }

        const randomIndex = Math.floor(Math.random() * potentialReplacements.length);
        const newChallengeMeta = potentialReplacements[randomIndex];

        const newDailySetIds = currentDailySetIds.map(id => (id === challengeIdToSkip ? newChallengeMeta.id : id));
        localStorage.setItem(LS_CURRENT_DAILY_SET, JSON.stringify(newDailySetIds));
        localStorage.removeItem(`challengeTimer_${challengeIdToSkip}`);
        console.log(`Timer for skipped challenge ${challengeIdToSkip} cleared.`);

        const newDailySetFullMeta = await Promise.all(newDailySetIds.map(id => getQuestion(id)));
        
        if (newDailySetFullMeta.some(meta => !meta)) {
            console.error("Failed to fetch metadata for one or more challenges in the new daily set.");
            alert("An error occurred while updating the challenge list. Please refresh.");
            // Fallback: re-run the full daily selection process might be too much here, better to signal error
        } else {
            await loadChallengeList(); // Update sidebar
        }
        updateLoadingProgress("Idle", 0); // Reset progress
        loadChallenge(newChallengeMeta.id);
    }

    function getInitialDurationForLevel(levelString) {
        const level = levelString ? levelString.toLowerCase() : 'easy';
        if (level === 'easy') {
            return 4 * 60 + 10; // 4 minutes 10 seconds
        } else if (level === 'medium') {
            return 8 * 60 + 20; // 8 minutes 20 seconds
        }
        
        return 4 * 60 + 10; // Default to easy
    }

    async function getAllChallengeMetadata() {
        // Try to get from cache first
        const cachedDataString = localStorage.getItem(LS_ALL_METADATA_CACHE);
        if (cachedDataString) {
            try {
                const cachedData = JSON.parse(cachedDataString);
                if (cachedData && cachedData.timestamp && (Date.now() - cachedData.timestamp < METADATA_CACHE_EXPIRATION_MS)) {
                    console.log("[CACHE HIT] Using cached allChallengeMetadata.");
                    return cachedData.metadata; // Return the cached metadata array
                } else {
                    console.log("[CACHE STALE/INVALID] Cached allChallengeMetadata expired or invalid. Fetching new data.");
                    localStorage.removeItem(LS_ALL_METADATA_CACHE); // Remove stale/invalid data
                }
            } catch (e) {
                console.error("Error parsing cached allChallengeMetadata. Removing from cache.", e);
                localStorage.removeItem(LS_ALL_METADATA_CACHE);
            }
        }

        console.log("[CACHE MISS] Fetching allChallengeMetadata by processing challenges.json and individual questions.");
        const allMetadata = [];
        try {
            const response = await fetch('./challenges.json');

            if (!response.ok) throw new Error(`HTTP error! status: ${response.status} for challenges.json`);

            const challengeIdList = await response.json();

            for (const item of challengeIdList) {
                const challengeId = item.id;
                try {
                    // Call getQuestion to leverage caching and existing logic
                    const actualChallengeData = await getQuestion(challengeId); 

                    if (!actualChallengeData) {
                        console.warn(`Could not retrieve challenge data for ID ${challengeId} via getQuestion. Skipping in metadata.`);
                        continue;
                    }

                    allMetadata.push({
                        id: challengeId,
                        title: actualChallengeData.title || `Challenge ${challengeId}`,
                        level: actualChallengeData.level || 'easy',
                        category: actualChallengeData.category || 'General'
                    });
                } catch (error) {
                    console.error(`Error fetching details for challenge ${challengeId}:`, error);
                }
            }
        } catch (error) {
            console.error('Error loading challenge list for report:', error);
            reportContentArea.innerHTML = `<p style="color:red;">Could not load challenge data for the report.</p>`;
            return []; // Return empty array on critical error
        }

        // After successfully building allMetadata, cache it
        try {
            const dataToCache = {
                timestamp: Date.now(),
                metadata: allMetadata
            };
            localStorage.setItem(LS_ALL_METADATA_CACHE, JSON.stringify(dataToCache));
            console.log("allChallengeMetadata cached successfully.");
        } catch (e) {
            console.error("Error saving allChallengeMetadata to localStorage. May be out of space.", e);
        }
        return allMetadata;
    }

    retryChallengeBtn.addEventListener('click', () => {
        if (!currentChallengeData) return;

        const challengeIdToRetry = currentChallengeData.id;
        const solvedChallenges = getSolvedChallengesData();
        delete solvedChallenges[challengeIdToRetry];
        localStorage.setItem(LS_SOLVED_CHALLENGES, JSON.stringify(solvedChallenges));

        // Clear saved editor content for this challenge upon retry
        const editorContentKey = `${LS_EDITOR_CONTENT_PREFIX}${challengeIdToRetry}`;
        localStorage.removeItem(editorContentKey);
        console.log(`Cleared saved editor content for ${challengeIdToRetry} from localStorage.`);

        const challengeLink = document.querySelector(`.challenge-link[data-challenge-id="${challengeIdToRetry}"]`);
        if (challengeLink) {
            challengeLink.classList.remove('passed');
            const tickMark = challengeLink.querySelector('.tick-mark');
            if (tickMark) tickMark.remove();
        }

        loadChallenge(challengeIdToRetry);
    });

    skipChallengeBtn.addEventListener('click', () => {
        if (!currentChallengeData) return;

        const currentChallengeId = currentChallengeData.id;
        console.log(`Attempting to skip challenge: ${currentChallengeId}`);
        handleSkipChallenge(currentChallengeId)
    });

    // Initial call to update the tracker when the page loads
    updateHomepageProgressTracker();
    // Refresh the tracker every 30 seconds to keep it live
    setInterval(updateHomepageProgressTracker, 5000); // Refresh every 5 seconds
});