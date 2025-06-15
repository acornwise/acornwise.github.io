let editor;
let pyodide;
let currentChallengeData = null;
let markedModule;
let timerInterval;
let initialChallengeDuration;
let currentRemainingTime;
let timerRunning = false;
let startTime;

const LS_LAST_DAILY_SELECTION_TIMESTAMP = 'acornwise_lastDailySelectionTimestamp';
const LS_CURRENT_DAILY_SET = 'acornwise_currentDailySet';
const LS_SOLVED_CHALLENGES = 'acornwise_solvedChallenges';
const LS_QUESTION_FILE_CACHE_PREFIX = 'acornwise_question_file_';
const LS_ALL_METADATA_CACHE = 'acornwise_all_metadata_cache';

const DAILY_CHALLENGE_COUNT = 5;
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;
const METADATA_CACHE_EXPIRATION_MS = 72 * 60 * 60 * 1000; // 72 hours
const ONE_YEAR_MS = 365 * TWENTY_FOUR_HOURS_MS;

let previousViewBeforeReport = 'daily'; // To store which view was active before showing the report
document.addEventListener('DOMContentLoaded', () => {
    const runButton = document.getElementById('run-code-btn');
    const pyodideStatus = document.getElementById('pyodide-status');
    const resultsOutput = document.getElementById('results-output');
    const descriptionArea = document.getElementById('description-area');
    const testCasesArea = document.getElementById('test-cases-area');
    const challengeNavigation = document.getElementById('challenge-navigation'); // Get navigation element
    const customInput = document.getElementById('custom-input');
    const customExpectedOutput = document.getElementById('custom-expected-output');
    const runCustomTestBtn = document.getElementById('run-custom-test-btn');
    const customTestResultDiv = document.getElementById('custom-test-result');
    const timerDisplay = document.getElementById('timer-display');    
    const viewProgressReportBtn = document.getElementById('view-progress-report-btn');
    const progressReportContainer = document.getElementById('progress-report-container');
    const reportContentArea = document.getElementById('report-content-area');
    const backToChallengesBtn = document.getElementById('back-to-challenges-btn');
    const backToDailyViewBtn = document.getElementById('back-to-daily-view-btn'); // New button in main header
    const retryChallengeBtn = document.getElementById('retry-challenge-btn');    
    const dailyChallengesView = document.getElementById('daily-challenges-view');
    const mainContentArea = document.querySelector('main'); // The main IDE area
    const nextSelectionCountdownDisplay = document.getElementById('next-selection-countdown');
    const dailyTotalTimeLimitDisplay = document.getElementById('daily-total-time-limit');
    const dailyChallengeListContainer = document.getElementById('daily-challenge-list-container');
    const loadingScreen = document.getElementById('loading-screen');
    const loadingTaskText = document.getElementById('loading-task-text');
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
    // --- Pyodide Initialization ---
    async function initializePyodide() {
        try {
            pyodideStatus.textContent = "Loading Pyodide (this may take a moment)...";
            runButton.disabled = true;
            runCustomTestBtn.disabled = true;

            pyodide = await loadPyodide();
            pyodideStatus.textContent = "Pyodide ready.";
            runButton.disabled = false;
            runCustomTestBtn.disabled = false;
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

        updateLoadingProgress("Initializing Python Environment...", 25);
        // Await critical initializations before hiding the loading screen
        await initializePyodide();

        updateLoadingProgress("Fetching Challenge List...", 50);
        await loadChallengeList(); // For sidebar, depends on daily set being potentially available

        updateLoadingProgress("Preparing Today's Workout...", 75);
        await manageDailyChallengeSelection(); // This renders the first interactive view

        updateLoadingProgress("Finalizing Setup...", 95);

        // Hide loading screen and show the daily challenges view
        if (loadingScreen) {
            loadingScreen.style.display = 'none';
        }
        // Initial state: Daily view is shown, so "Back to Daily" is hidden, "Progress Report" is visible.
        backToDailyViewBtn.style.display = 'none';        
        // No need to update progress to 100% here as the screen is hidden
        dailyChallengesView.style.display = 'block'; // Or 'flex' if its layout requires it
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

            } else if (inputType === "function_call") {
                if (!functionName) {
                    throw new Error("Function name is not defined for 'function_call' input type.");
                }
                await pyodide.runPythonAsync(`import json`);
                const pythonInputArgs = JSON.stringify(testCase.input);

                const codeToExecute = `
${userCode}

# Test harness code for function call
_input_args = json.loads('${pythonInputArgs}')
try:
    _actual_output_func_call = ${functionName}(*_input_args)
except Exception as e:
    _actual_output_func_call = f"ERROR: {e}"
`;
                await pyodide.runPythonAsync(codeToExecute);
                const actualOutput = pyodide.globals.get('_actual_output_func_call');
                const expectedOutput = testCase.expected_output;

                if (JSON.stringify(actualOutput) === JSON.stringify(expectedOutput)) {
                    resultDiv.textContent = `PASS`;
                    resultDiv.classList.add('pass');
                    passed = true;
                } else {
                    resultDiv.textContent = `FAIL (Expected: ${JSON.stringify(expectedOutput)}, Got: ${JSON.stringify(actualOutput)})`;
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

    runButton.addEventListener('click', async () => {
        if (!pyodide || !currentChallengeData) {
            resultsOutput.textContent = "Error: Pyodide not loaded or no challenge selected.";
            return;
        }

        const userCode = editor.getValue();
        resultsOutput.textContent = "Running tests...";
        runButton.disabled = true;
        runCustomTestBtn.disabled = true;

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
                currentChallengeData.function_name
            );
            if (!passedThisTest) {
                overallPass = false;
            }
        }

        resultsOutput.textContent = `All tests completed. Overall: ${overallPass ? 'PASS' : 'FAIL'}`;
        runButton.disabled = false;
        runCustomTestBtn.disabled = false;

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
        runButton.style.display = 'none';
        runCustomTestBtn.style.display = 'none';
    }    

    runCustomTestBtn.addEventListener('click', async () => {
        if (!pyodide || !currentChallengeData) {
            customTestResultDiv.textContent = "Error: Pyodide not loaded or no challenge selected.";
            return;
        }

        const userCode = editor.getValue();
        const customInputValue = customInput.value.trim();
        let customExpectedOutputValue = customExpectedOutput.value.trim();

        try {
            customExpectedOutputValue = JSON.parse(customExpectedOutputValue);
        } catch (e) {
            // If not valid JSON, keep as string
        }

        let parsedCustomInput;
        if (currentChallengeData.input_type === "stdin") {
            parsedCustomInput = customInputValue.split('\n');
        } else if (currentChallengeData.input_type === "function_call") {
            try {
                parsedCustomInput = JSON.parse(customInputValue);
                if (!Array.isArray(parsedCustomInput)) {
                    throw new Error("Function call input must be a JSON array.");
                }
            } catch (e) {
                customTestResultDiv.textContent = `ERROR: Invalid JSON input for function call: ${e.message}`;
                customTestResultDiv.classList.add('fail');
                runButton.disabled = false;
                runCustomTestBtn.disabled = false;
                return;
            }
        } else if (currentChallengeData.input_type === "file_read" || currentChallengeData.input_type === "file_io") {
            parsedCustomInput = customInputValue;
        } else {
            parsedCustomInput = customInputValue;
        }

        if (!customInputValue && !currentChallengeData.input_type.startsWith("file_")) {
             customTestResultDiv.textContent = "Please provide custom input.";
             customTestResultDiv.classList.add('fail');
             return;
        }

        const customTestCase = {
            input: parsedCustomInput,
            expected_output: customExpectedOutputValue,
            input_file_content: (currentChallengeData.input_type === "file_read" || currentChallengeData.input_type === "file_io") ? customInputValue : undefined,
            input_filename: currentChallengeData.test_cases[0].input_filename,
            output_filename: currentChallengeData.test_cases[0].output_filename
        };

        runButton.disabled = true;
        runCustomTestBtn.disabled = true;

        await runSingleTest(
            customTestCase,
            userCode,
            customTestResultDiv,
            currentChallengeData.input_type,
            currentChallengeData.function_name
        );

        runButton.disabled = false;
        runCustomTestBtn.disabled = false;
    });

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

        // Clear previous challenge data immediately
        currentChallengeData = null; 

        descriptionArea.innerHTML = '<p>Loading challenge details...</p>';
        testCasesArea.innerHTML = '<p>Loading test cases...</p>';
        resultsOutput.textContent = '';
        customTestResultDiv.textContent = '';
        customTestResultDiv.classList.remove('pass', 'fail', 'running');

        // Clear editor content or set to a loading message
        if (editor) {
            editor.setValue("# Loading challenge...\n");
        }

        dailyChallengesView.style.display = 'none';
        mainContentArea.style.display = 'flex';
        viewProgressReportBtn.style.display = 'block';
        backToDailyViewBtn.style.display = 'block';        

        runButton.disabled = true;
        runCustomTestBtn.disabled = true;

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

            if (editor) {
                editor.setValue(challengeData.starter_code + "\n");
            }
            runButton.disabled = false;
            runCustomTestBtn.disabled = false;

            testCasesArea.innerHTML = '';
            const testCaseList = document.createElement('ul');
            testCaseList.classList.add('test-case-list');

            challengeData.test_cases.forEach((testCase, index) => {
                const listItem = document.createElement('li');
                listItem.classList.add('test-case-item');

                let inputContentHtml = '';                
                const outputValue = testCase.expected_output;

                if (challengeData.input_type === "stdin") {
                    inputContentHtml = testCase.input.map(line => `<i>${line}</i>`).join('<br>');
                } else if (challengeData.input_type === "function_call") {
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

                let expectedOutputHtml = '';

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
                runButton.style.display = 'inline-block'; 
                runCustomTestBtn.style.display = 'inline-block';

                startTimer();
            }
        } catch (error) {
            console.error('Error loading challenge:', error);
            descriptionArea.innerHTML = `<p style="color: red;">Failed to load challenge ${challengeId}. Error: ${error.message}</p>`;
            testCasesArea.innerHTML = `<p style="color: red;">Test cases could not be loaded.</p>`;
            runButton.disabled = true;
            runCustomTestBtn.disabled = true;
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

                return { id: challengeId, title: challengeData.title };
            });

            const challengesWithTitles = (await Promise.all(challengePromises)).filter(Boolean); // Filter out nulls

            challengesWithTitles.forEach(challenge => {
                const li = document.createElement('li');
                const a = document.createElement('a');

                a.dataset.challengeId = challenge.id;
                a.classList.add('challenge-link');
                a.href = `#${challenge.id}`;

                const solvedData = getSolvedChallengeData(challenge.id);
                if (solvedData?.wasSolvedInTime) {
                    a.classList.add('passed');
                    const tickSpan = document.createElement('span');
                    tickSpan.classList.add('tick-mark');
                    tickSpan.innerHTML = '&#10003;';
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
            dailyChallengesView.style.display = 'block';
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

    async function renderDailyChallengesPage(dailyChallengeMetaObjects) {
        dailyChallengeListContainer.innerHTML = '';
        let totalTime = 0;

        if (!dailyChallengeMetaObjects || dailyChallengeMetaObjects.length === 0) {
            dailyChallengeListContainer.innerHTML = '<p>No challenges available for today. Please check back later!</p>';
            dailyTotalTimeLimitDisplay.textContent = 'N/A';
            return;
        }

        for (const challenge of dailyChallengeMetaObjects) {
            const itemDiv = document.createElement('div');
            itemDiv.classList.add('daily-challenge-item');
            itemDiv.dataset.challengeId = challenge.id;
            itemDiv.innerHTML = `
                <h3>${challenge.title}</h3>
                <p>Category: ${challenge.category || 'General'}</p>
            `;
            
            // Add main click listener to the entire itemDiv for navigation
            itemDiv.addEventListener('click', () => {
                console.log(`Challenge clicked: ${challenge.id}`);
                window.location.hash = challenge.id; // This will trigger loadChallenge via hashchange
            });
            
            const skipButton = document.createElement('button');
            skipButton.classList.add('skip-challenge-btn');
            skipButton.textContent = 'Skip This Challenge';
            skipButton.dataset.skipId = challenge.id;

            const solvedData = getSolvedChallengeData(challenge.id);
            if (solvedData && solvedData.wasSolvedInTime) {
                skipButton.disabled = true;
            }

            skipButton.addEventListener('click', (event) => {
                event.stopPropagation(); // Prevent triggering the itemDiv click listener
                handleSkipChallenge(challenge.id);
            });

            itemDiv.appendChild(skipButton);
            dailyChallengeListContainer.appendChild(itemDiv);
            totalTime += getInitialDurationForLevel(challenge.level);
        }
        dailyTotalTimeLimitDisplay.textContent = formatTime(totalTime);
        updateNextSelectionCountdown();
    }

    function updateNextSelectionCountdown() {
        const lastSelection = parseInt(localStorage.getItem(LS_LAST_DAILY_SELECTION_TIMESTAMP), 10);
        if (!lastSelection) {
            nextSelectionCountdownDisplay.textContent = "Ready now!";
            return;
        }

        const intervalId = setInterval(() => {
            const now = Date.now();
            const nextSelectionTime = lastSelection + TWENTY_FOUR_HOURS_MS;
            const remainingMs = nextSelectionTime - now;

            if (remainingMs <= 0) {
                nextSelectionCountdownDisplay.textContent = "Ready for new selection!";
                clearInterval(intervalId);
            } else {
                const hours = Math.floor(remainingMs / (1000 * 60 * 60));
                const minutes = Math.floor((remainingMs % (1000 * 60 * 60)) / (1000 * 60));
                const seconds = Math.floor((remainingMs % (1000 * 60)) / 1000);
                nextSelectionCountdownDisplay.textContent = 
                    `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
            }
        }, 1000);
    }

    async function manageDailyChallengeSelection() {
        let currentDailySetMeta;
        if (isTimeForNewDailySelection()) {
            console.log("Time for new daily selection or first time.");
            currentDailySetMeta = await selectNewDailyChallenges();
        } else {
            const dailySetIds = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
            const allMeta = await getAllChallengeMetadata();
            currentDailySetMeta = dailySetIds.map(id => allMeta.find(m => m.id === id)).filter(Boolean);
        }
        renderDailyChallengesPage(currentDailySetMeta);
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

        // Re-fetch metadata for the new set to pass to renderDailyChallengesPage
        const newDailySetFullMeta = await Promise.all(newDailySetIds.map(id => getQuestion(id)));
        
        if (newDailySetFullMeta.some(meta => !meta)) {
            console.error("Failed to fetch metadata for one or more challenges in the new daily set.");
            alert("An error occurred while updating the challenge list. Please refresh.");
            // Fallback: re-run the full daily selection process might be too much here, better to signal error
        } else {
            renderDailyChallengesPage(newDailySetFullMeta.filter(Boolean)); // Filter out nulls just in case
            backToDailyViewBtn.style.display = 'none';
            await loadChallengeList(); // Update sidebar
        }
        updateLoadingProgress("Idle", 0); // Reset progress
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

    async function renderProgressReport() {
        reportContentArea.innerHTML = '<p>Generating report...</p>';
        const allChallengeMeta = await getAllChallengeMetadata();
        const progressByDate = {};
        const inProgressChallenges = [];

        allChallengeMeta.forEach(challenge => {
            const solvedData = getSolvedChallengeData(challenge.id);            
 
            if (solvedData) {
                const solvedDateKey = new Date(solvedData.solvedTimestamp).toLocaleDateString('en-CA'); // YYYY-MM-DD format
                const solvedTimeSeconds = solvedData.timeTakenSeconds;
                const initialDuration = solvedData.initialDurationSeconds;
                const status = solvedTimeSeconds <= initialDuration ? "In Time" : "Over Time";

                if (!progressByDate[solvedDateKey]) {
                    progressByDate[solvedDateKey] = {
                        solvedCount: 0,
                        inTimeCount: 0,
                        overTimeCount: 0,
                        challenges: []
                    };
                }

                progressByDate[solvedDateKey].solvedCount++;
                if (status === "In Time") {
                    progressByDate[solvedDateKey].inTimeCount++;
                } else {
                    progressByDate[solvedDateKey].overTimeCount++;
                }
                progressByDate[solvedDateKey].challenges.push({
                    title: challenge.title,
                    timeTaken: formatTime(solvedTimeSeconds),
                    status: status
                });
            } else if (localStorage.getItem(`challengeTimer_${challenge.id}`)) {
                inProgressChallenges.push({ title: challenge.title });
            }
        });

        let reportHTML = '<h3>Solved Challenges by Date</h3>';
        const sortedDates = Object.keys(progressByDate).sort((a, b) => new Date(b) - new Date(a)); // Newest first

        if (sortedDates.length === 0) {
            reportHTML += '<p>No challenges solved yet. Keep practicing!</p>';
        } else {
            sortedDates.forEach(date => {
                const data = progressByDate[date];
                reportHTML += `
                    <div class="report-date-section">
                        <h4>${new Date(date + 'T00:00:00').toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}</h4>
                        <p><strong>Total Solved:</strong> ${data.solvedCount} | 
                           <strong>In Time:</strong> ${data.inTimeCount} | 
                           <strong>Over Time:</strong> ${data.overTimeCount}</p>
                        <ul>
                            ${data.challenges.map(c => `<li>${c.title} - ${c.status} (Took: ${c.timeTaken})</li>`).join('')}
                        </ul>
                    </div>
                `;
            });
        }

        reportHTML += '<h3>Challenges Currently In Progress (Not Yet Solved)</h3>';
        if (inProgressChallenges.length === 0) {
            reportHTML += '<p>No challenges currently in progress.</p>';
        } else {
            reportHTML += '<ul>';
            inProgressChallenges.forEach(c => {
                reportHTML += `<li>${c.title}</li>`;
            });
            reportHTML += '</ul>';
        }

        reportContentArea.innerHTML = reportHTML;
    }

    viewProgressReportBtn.addEventListener('click', () => {
        // Determine which view is currently active and store it
        if (dailyChallengesView.style.display !== 'none') {
            previousViewBeforeReport = 'daily';
            dailyChallengesView.style.display = 'none';
        } else if (mainContentArea.style.display !== 'none') {
            previousViewBeforeReport = 'main';
            mainContentArea.style.display = 'none';
        }
        // Hide both just in case, though one should already be hidden
        dailyChallengesView.style.display = 'none'; 
        mainContentArea.style.display = 'none'; 

        progressReportContainer.style.display = 'block';
        viewProgressReportBtn.style.display = 'none';
        backToDailyViewBtn.style.display = 'block';
        renderProgressReport();
    });

    backToChallengesBtn.addEventListener('click', () => {
        progressReportContainer.style.display = 'none';
        if (previousViewBeforeReport === 'daily') {
            dailyChallengesView.style.display = 'block';
            mainContentArea.style.display = 'none'; 
            viewProgressReportBtn.style.display = 'block';
            backToDailyViewBtn.style.display = 'none';            
        } else if (previousViewBeforeReport === 'main') {
            mainContentArea.style.display = 'flex'; // Or 'block' if that's its default
            dailyChallengesView.style.display = 'none'; // Ensure daily view is hidden
            viewProgressReportBtn.style.display = 'block';
            backToDailyViewBtn.style.display = 'block';            
        } else {
            // Default fallback if something went wrong with previousViewBeforeReport
            dailyChallengesView.style.display = 'block'; 
            mainContentArea.style.display = 'none';
            viewProgressReportBtn.style.display = 'block';
            backToDailyViewBtn.style.display = 'none';            
        }
        window.scrollTo(0, 0); // Scroll to the top of the page
    });

    retryChallengeBtn.addEventListener('click', () => {
        if (!currentChallengeData) return;

        const challengeIdToRetry = currentChallengeData.id;
        const solvedChallenges = getSolvedChallengesData();
        delete solvedChallenges[challengeIdToRetry];
        localStorage.setItem(LS_SOLVED_CHALLENGES, JSON.stringify(solvedChallenges));

        const challengeLink = document.querySelector(`.challenge-link[data-challenge-id="${challengeIdToRetry}"]`);
        if (challengeLink) {
            challengeLink.classList.remove('passed');
            const tickMark = challengeLink.querySelector('.tick-mark');
            if (tickMark) tickMark.remove();
        }

        loadChallenge(challengeIdToRetry);
    });

    // Event Listener for the new "Back to Daily Workout" button in the header
    backToDailyViewBtn.addEventListener('click', () => {
        mainContentArea.style.display = 'none';
        progressReportContainer.style.display = 'none'; // Hide report if it was open
        dailyChallengesView.style.display = 'block';
        backToDailyViewBtn.style.display = 'none'; // Hide itself
        viewProgressReportBtn.style.display = 'block'; // Ensure progress report button is visible
        if (window.location.hash) { // Clear the hash
            history.replaceState(null, '', window.location.pathname + window.location.search);
        }
        window.scrollTo(0, 0);
    });    
});