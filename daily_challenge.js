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

console.log("DEBUG: Script execution started.");

let editor;
let pyodide;
let currentChallengeData = null;
let typeListener;

const CATEGORIES = [
    "Abstraction", "Algorithms", "Decomposition", "Evaluation", 
    "Modelling and Simulation", "Pattern Recognition"
];
const LS_SOLVED_CHALLENGES = 'acornwise_solvedChallenges';
const LS_DAILY_COMPLETION_RECORDS = 'acornwise_dailyCompletionRecords';
const LS_CURRENT_DAILY_SET = 'acornwise_currentDailySet';
const LS_LAST_DAILY_SELECTION_TIMESTAMP = 'acornwise_lastDailySelectionTimestamp';
const LS_ALL_METADATA_CACHE = 'acornwise_all_metadata_cache';
const LS_QUESTION_FILE_CACHE_PREFIX = 'acornwise_question_file_';
const LS_EDITOR_CONTENT_PREFIX = 'acornwise_editor_content_';


const getSolvedChallengesData = () => {
    try {
        const data = localStorage.getItem(LS_SOLVED_CHALLENGES);
        return data ? JSON.parse(data) : {};
    } catch (error) {
        console.error("Failed to parse solved challenges data from localStorage:", error);
        return {};
    }
};

const getDailyCompletionRecords = () => {
    try {
        const records = localStorage.getItem(LS_DAILY_COMPLETION_RECORDS);
        return records ? JSON.parse(records) : {};
    } catch (error) {
        console.error("Error parsing daily completion records from localStorage:", error);
        return {};
    }
};

const updateHomepageProgressTracker = () => {
    console.log("DEBUG: Updating homepage progress tracker.");

    const todayProgressEl = document.getElementById('today-progress');
    const currentDayEl = document.getElementById('current-day');
    const streakEl = document.getElementById('streak');
    const partiallySolvedEl = document.getElementById('partially-solved');
    const totalSolvedEl = document.getElementById('total-solved');
    const remainingDaysEl = document.getElementById('remaining-days');
    const progressFillEl = document.getElementById('progress-fill');
    
    if (!todayProgressEl || !streakEl || !totalSolvedEl || !progressFillEl) {
        console.warn("DEBUG: One or more progress tracker elements were not found.");
        return;
    }

    const solvedChallenges = getSolvedChallengesData();
    const dailySet = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
    const dailyRecords = getDailyCompletionRecords();

    const solvedTodayCount = dailySet.filter(id => solvedChallenges[id] && solvedChallenges[id].passed).length;
    const todayProgressPercentage = dailySet.length > 0 ? Math.round((solvedTodayCount / dailySet.length) * 100) : 0;
    const totalSolvedCount = Object.keys(solvedChallenges).length;

    let currentStreak = 0;
    let currentDate = new Date();
    while (true) {
        const dateString = currentDate.toISOString().slice(0, 10);
        if (dailyRecords[dateString] && dailyRecords[dateString] >= 5) { 
            currentStreak++;
            currentDate.setDate(currentDate.getDate() - 1);
        } else {
            break;
        }
    }
    
    const partiallySolvedDays = Object.values(dailyRecords).filter(count => count > 0 && count < 5).length;
    
    const now = new Date();
    const startOfYear = new Date(now.getFullYear(), 0, 0);
    const diff = now - startOfYear;
    const oneDay = 1000 * 60 * 60 * 24;
    const dayOfYear = Math.floor(diff / oneDay);
    const daysRemaining = 365 - dayOfYear;

    todayProgressEl.textContent = `${todayProgressPercentage} %`;
    currentDayEl.textContent = dayOfYear;
    streakEl.textContent = currentStreak;
    partiallySolvedEl.textContent = partiallySolvedDays;
    totalSolvedEl.textContent = totalSolvedCount;
    remainingDaysEl.textContent = daysRemaining;
    progressFillEl.style.width = `${todayProgressPercentage}%`;
};


document.addEventListener('DOMContentLoaded', () => {
    console.log("DEBUG: DOMContentLoaded event fired.");
    const statusMessage = document.getElementById('status-message');
    statusMessage.textContent = "Loading essential libraries...";

    const monacoReadyPromise = new Promise(resolve => {
        console.log("DEBUG: Starting Monaco loader setup.");
        require.config({ paths: { 'vs': 'https://cdnjs.cloudflare.com/ajax/libs/monaco-editor/0.48.0/min/vs' }});
        require(['vs/editor/editor.main'], function() {
            console.log("DEBUG: Monaco Editor library has been loaded by RequireJS.");
            resolve();
        });
    });

    const pyodideReadyPromise = (async () => {
        console.log("DEBUG: Starting Pyodide load.");
        try {
            pyodide = await loadPyodide();
            console.log("DEBUG: Pyodide environment has been loaded.");
        } catch (error)
        {
            console.error('Pyodide loading failed:', error);
            statusMessage.textContent = 'Failed to load Python environment.';
            throw error;
        }
    })();
    
    console.log("DEBUG: Waiting for promises (Monaco, Pyodide) to resolve.");
    Promise.all([monacoReadyPromise, pyodideReadyPromise]).then(() => {
        console.log("DEBUG: All essential libraries are loaded. Initializing the application.");
        initializeApp();
    }).catch(error => {
        console.error("Failed to initialize the application due to a dependency error:", error);
        statusMessage.textContent = `A critical error occurred: ${error.message}`;
    });

    async function initializeApp() {
        console.log("DEBUG: initializeApp() started.");
        
        const challengeListDiv = document.getElementById('challenge-list');
        const challengeTitle = document.getElementById('challenge-title');
        const markdownContentDiv = document.getElementById('markdown-content');
        const testCasesArea = document.getElementById('test-cases-area');
        const outputArea = document.getElementById('output-area');
        const runCodeBtn = document.getElementById('run-code-btn');
        const retryChallengeBtn = document.getElementById('retry-challenge-btn');
        const skipChallengeBtn = document.getElementById('skip-challenge-btn');
        const editorContainer = document.getElementById('editor-container');
        const challengeDateEl = document.getElementById('challenge-date');

        const handleSkipChallenge = (challengeId) => {
            if (!challengeId) return;
        
            const dailySet = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
            const solvedChallenges = getSolvedChallengesData();
            const currentIndex = dailySet.findIndex(id => id === challengeId);
        
            if (currentIndex !== -1) {
                for (let i = currentIndex + 1; i < dailySet.length; i++) {
                    const nextChallengeId = dailySet[i];
                    if (!solvedChallenges[nextChallengeId] || !solvedChallenges[nextChallengeId].passed) {
                        console.log(`DEBUG: Skipping to next unsolved challenge: ${nextChallengeId}`);
                        loadChallenge(nextChallengeId);
                        return;
                    }
                }
            }
        
            console.log("DEBUG: No more unsolved challenges to skip to.");
            const allTodaySolved = dailySet.every(id => solvedChallenges[id] && solvedChallenges[id].passed);
            if (allTodaySolved) {
                document.getElementById('status-message').textContent = "🎉 Congratulations! You've completed all of today's challenges! 🎉";
            } else {
                document.getElementById('status-message').textContent = "You've reached the end of the list for now!";
            }
        };

        statusMessage.textContent = "Initializing editor...";
        console.log("DEBUG: Creating Monaco editor instance.");
        editor = monaco.editor.create(editorContainer, {
            value: '# Welcome to AcornWise Daily Coding Challenges!\n# Select a challenge to begin.',
            language: 'python',
            theme: 'vs-light',
            automaticLayout: true
        });

        statusMessage.textContent = 'Fetching challenges...';
        console.log("DEBUG: Fetching all challenge metadata.");

        async function fetchAllMetadata() {
            const cachedMetadata = localStorage.getItem(LS_ALL_METADATA_CACHE);
            if (cachedMetadata) {
                console.log("DEBUG: Loading all metadata from cache.");
                try {
                    const parsed = JSON.parse(cachedMetadata);
                    if (Array.isArray(parsed)) return parsed;
                } catch (e) {
                    console.warn("DEBUG: Failed to parse cached metadata, fetching from server.");
                    localStorage.removeItem(LS_ALL_METADATA_CACHE);
                }
            }
            
            console.log("DEBUG: Fetching all metadata from server by category.");
            let allMetadata = [];
            for (const category of CATEGORIES) {
                try {
                    const response = await fetch(`questions/${category}.json`);
                    const questions = await response.json();
                    if (Array.isArray(questions)) {
                        const metadata = questions.map(q => ({ id: q.id, title: q.title, category: q.category }));
                        allMetadata.push(...metadata);
                    }
                } catch (error) {
                    console.error(`Failed to fetch metadata for category: ${category}`, error);
                }
            }
            
            localStorage.setItem(LS_ALL_METADATA_CACHE, JSON.stringify(allMetadata));
            return allMetadata;
        }

        const allMetadata = await fetchAllMetadata();
        console.log(`DEBUG: Fetched ${allMetadata.length} total metadata records.`);

        async function selectDailyChallenges(metadata) {
            console.log("DEBUG: Selecting daily challenges.");
            if (!Array.isArray(metadata) || metadata.length === 0) {
                console.error("Cannot select challenges, metadata is empty or not an array:", metadata);
                return [];
            }

            const solvedChallenges = getSolvedChallengesData();
            const unsolved = metadata.filter(m => m && m.id && (!solvedChallenges[m.id] || !solvedChallenges[m.id].passed));
            const solved = metadata.filter(m => m && m.id && solvedChallenges[m.id] && solvedChallenges[m.id].passed);

            let selected = [];
            let availableUnsolved = [...unsolved];

            // 1. Add all unsolved challenges first
            selected.push(...availableUnsolved);

            // 2. If we still need more questions, add from the solved pool
            if (selected.length < 5) {
                let availableSolved = [...solved];
                // Shuffle solved to make the selection random
                availableSolved.sort(() => 0.5 - Math.random());
                
                while (selected.length < 5 && availableSolved.length > 0) {
                    const choice = availableSolved.pop();
                    if (choice && !selected.find(s => s.id === choice.id)) {
                         selected.push(choice);
                    }
                }
            }

            // 3. If there are more than 5, shuffle and slice
            if (selected.length > 5) {
                 selected.sort(() => 0.5 - Math.random()); // Shuffle the array
                 selected = selected.slice(0, 5); // Take the first 5
            }
            
            // 4. Return just the IDs
            const selectedIds = selected.map(s => s.id);
            console.log("DEBUG: Selected daily set:", selectedIds);
            return selectedIds;
        }
        
        const today = new Date().toISOString().slice(0, 10);
        challengeDateEl.textContent = `Today's challenges for ${new Date().toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}`;
        const lastSelectionTimestamp = localStorage.getItem(LS_LAST_DAILY_SELECTION_TIMESTAMP);

        if (lastSelectionTimestamp !== today) {
            console.log("DEBUG: New day, selecting new challenges.");
            const dailySet = await selectDailyChallenges(allMetadata);
            localStorage.setItem(LS_CURRENT_DAILY_SET, JSON.stringify(dailySet));
            localStorage.setItem(LS_LAST_DAILY_SELECTION_TIMESTAMP, today);
        } else {
            console.log("DEBUG: Challenges for today already selected.");
        }

        const dailySetIds = JSON.parse(localStorage.getItem(LS_CURRENT_DAILY_SET) || '[]');
        const solvedChallenges = getSolvedChallengesData();
        console.log("DEBUG: Rendering challenge list.");

        challengeListDiv.innerHTML = dailySetIds.map(id => {
            const metadata = allMetadata.find(m => m.id === id);
            if (!metadata) return ''; 
            const isPassed = solvedChallenges[id] && solvedChallenges[id].passed;
            return `<a href="#" class="challenge-link block p-2 rounded-md hover:bg-gray-100 ${isPassed ? 'passed' : ''}" data-challenge-id="${id}">${metadata.title} ${isPassed ? '<span class="tick-mark">✅</span>' : ''}</a>`;
        }).join('');

        document.querySelectorAll('.challenge-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const challengeId = e.currentTarget.dataset.challengeId;
                console.log(`DEBUG: Challenge link clicked for ID: ${challengeId}`);
                loadChallenge(challengeId);
            });
        });
        
        const firstUnsolvedId = dailySetIds.find(id => !solvedChallenges[id] || !solvedChallenges[id].passed);
        if (firstUnsolvedId) {
            console.log(`DEBUG: Auto-loading first unsolved challenge: ${firstUnsolvedId}`);
            loadChallenge(firstUnsolvedId);
        } else if (dailySetIds.length > 0) {
            console.log("DEBUG: All challenges solved for today. Loading the first one for review.");
            loadChallenge(dailySetIds[0]);
        } else {
             console.log("DEBUG: No daily challenges found to auto-load.");
        }

        statusMessage.textContent = 'Ready! Select a challenge.';
        console.log("DEBUG: initializeApp() completed.");

        async function loadChallenge(id) {
            console.log(`DEBUG: Loading challenge with ID: ${id}`);
            
            document.querySelectorAll('.challenge-link').forEach(link => {
                link.classList.remove('bg-indigo-100', 'text-indigo-700', 'font-semibold');
            });
            const currentLink = document.querySelector(`.challenge-link[data-challenge-id="${id}"]`);
            if (currentLink) {
                currentLink.classList.add('bg-indigo-100', 'text-indigo-700', 'font-semibold');
            }

            const metadata = allMetadata.find(m => m.id === id);
            if (!metadata) {
                console.error("Could not find metadata for challenge ID:", id);
                challengeTitle.textContent = "Error: Challenge not found.";
                return;
            }
            challengeTitle.textContent = metadata.title;

            markdownContentDiv.innerHTML = "<p>Loading description...</p>";
            testCasesArea.innerHTML = "";
            outputArea.innerHTML = "<pre>Output will be shown here...</pre>";
            editor.setValue("# Loading starter code...");

            const cacheKey = `${LS_QUESTION_FILE_CACHE_PREFIX}${id}`;
            let challenge;
            const cachedChallenge = localStorage.getItem(cacheKey);

            if (cachedChallenge) {
                console.log(`DEBUG: Loading challenge ${id} from cache.`);
                challenge = JSON.parse(cachedChallenge);
            } else {
                console.log(`DEBUG: Fetching challenge ${id} from server.`);
                const response = await fetch(`questions/${metadata.category}.json`);
                const questions = await response.json();
                challenge = questions.find(q => q.id === id);
                localStorage.setItem(cacheKey, JSON.stringify(challenge));
            }

            currentChallengeData = challenge;
            
            const descriptionHTML = (challenge.description_md || "")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                .replace(/\n/g, '<br>');
            markdownContentDiv.innerHTML = descriptionHTML;
            
            const editorContentKey = `${LS_EDITOR_CONTENT_PREFIX}${id}`;
            const solvedChallenges = getSolvedChallengesData();
            const isSolved = solvedChallenges[id] && solvedChallenges[id].passed;

            if (isSolved) {
                // This is a previously solved question reappearing in the daily set.
                // As requested, reset its code to the starter template.
                console.log(`DEBUG: Challenge ${id} is already solved. Resetting editor to starter code.`);
                localStorage.removeItem(editorContentKey);
                editor.setValue(challenge.starter_code || '');
            } else {
                // This is an unsolved question. Load any saved progress.
                const savedEditorContent = localStorage.getItem(editorContentKey);
                editor.setValue(savedEditorContent || challenge.starter_code || '');
            }

            if(typeListener) typeListener.dispose();
            typeListener = editor.onDidChangeModelContent(() => {
                localStorage.setItem(editorContentKey, editor.getValue());
            });
            
            if (isSolved) {
                skipChallengeBtn.style.display = 'none';
            } else {
                skipChallengeBtn.style.display = '';
            }

            const testCasesHTML = (currentChallengeData.test_cases || []).map((tc, index) => {
                const formattedInput = tc.input.join(', ');
                return `
                    <div id="test-case-container-${index}" class="p-2 border rounded-md bg-gray-50">
                        <strong>Test ${index + 1}</strong>
                        <pre class="text-xs mt-1" id="test-case-details-${index}">Input: ${formattedInput}\nExpected: ${tc.expected_output}</pre>
                    </div>
                `;
            }).join('');
            testCasesArea.innerHTML = testCasesHTML;

            document.getElementById('test-case-result').textContent = '';
            console.log(`DEBUG: Challenge ${id} loaded successfully.`);
        }

        async function runCode() {
            if (!currentChallengeData || !pyodide) return;
            const code = editor.getValue();
            outputArea.innerHTML = '<pre>Running...</pre>';
            
            try {
                const results = await Promise.all(currentChallengeData.test_cases.map(async (tc) => {
                    const inputStr = tc.input.join('\n');
                    pyodide.globals.set("input_data", inputStr);
                    const pythonCode = `
import sys, io
sys.stdin = io.StringIO(input_data)
output_capture = io.StringIO()
sys.stdout = output_capture
try:
    exec(${JSON.stringify(code)})
finally:
    sys.stdout = sys.__stdout__
output_capture.getvalue()
                    `;
                    return await pyodide.runPythonAsync(pythonCode);
                }));

                if (results && results.length > 0) {
                    const sanitizedOutput = (results[0] || "").replace(/</g, "&lt;").replace(/>/g, "&gt;");
                    outputArea.innerHTML = `<pre>${sanitizedOutput}</pre>`;
                } else {
                    outputArea.innerHTML = '<pre>No output was produced.</pre>';
                }

                let allPassed = true;
                results.forEach((actualOutput, i) => {
                    const tc = currentChallengeData.test_cases[i];
                    const expected = tc.expected_output.toString().trim();
                    const actual = actualOutput.toString().trim();
                    const passed = actual === expected;
                    if (!passed) allPassed = false;

                    const container = document.getElementById(`test-case-container-${i}`);
                    const details = document.getElementById(`test-case-details-${i}`);
                    if (container && details) {
                        container.className = `p-2 border rounded-md ${passed ? 'bg-green-50' : 'bg-red-50'}`;
                        details.textContent = `Input: ${tc.input.join(', ')}\nExpected: ${expected}\nActual: ${actual}`;
                    }
                });

                const resultDiv = document.getElementById('test-case-result');
                resultDiv.textContent = allPassed ? 'All tests passed!' : 'Some tests failed.';
                resultDiv.className = `text-center font-semibold p-2 rounded-md ${allPassed ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`;

                if (allPassed) {
                    const solved = getSolvedChallengesData();
                    const isAlreadySolved = solved[currentChallengeData.id] && solved[currentChallengeData.id].passed;

                    if (!isAlreadySolved) {
                        solved[currentChallengeData.id] = { passed: true, timestamp: new Date().toISOString() };
                        localStorage.setItem(LS_SOLVED_CHALLENGES, JSON.stringify(solved));
                        const records = getDailyCompletionRecords();
                        const todayStr = new Date().toISOString().slice(0, 10);
                        records[todayStr] = (records[todayStr] || 0) + 1;
                        localStorage.setItem(LS_DAILY_COMPLETION_RECORDS, JSON.stringify(records));
                        updateHomepageProgressTracker();
                        const link = document.querySelector(`.challenge-link[data-challenge-id="${currentChallengeData.id}"]`);
                        if (link && !link.querySelector('.tick-mark')) {
                            link.classList.add('passed');
                            link.innerHTML += ' <span class="tick-mark">✅</span>';
                        }
                    }
                    
                    setTimeout(() => {
                        handleSkipChallenge(currentChallengeData.id);
                    }, 1500); 
                }
            } catch (error) {
                outputArea.innerHTML = `<pre class="text-red-500">${error}</pre>`;
            }
        }

        runCodeBtn.addEventListener('click', runCode);
        retryChallengeBtn.addEventListener('click', () => {
            if (!currentChallengeData) return;
            const id = currentChallengeData.id;
            const solved = getSolvedChallengesData();
            delete solved[id];
            localStorage.setItem(LS_SOLVED_CHALLENGES, JSON.stringify(solved));
            
            // The user's written code is now preserved on retry.
            // localStorage.removeItem(`${LS_EDITOR_CONTENT_PREFIX}${id}`);

            const link = document.querySelector(`.challenge-link[data-challenge-id="${id}"]`);
            if (link) {
                link.classList.remove('passed');
                const tick = link.querySelector('.tick-mark');
                if (tick) tick.remove();
            }
            updateHomepageProgressTracker();
            loadChallenge(id);
        });
        skipChallengeBtn.addEventListener('click', () => {
            if (currentChallengeData) handleSkipChallenge(currentChallengeData.id);
        });

        updateHomepageProgressTracker();
        setInterval(updateHomepageProgressTracker, 5000);
    }
});

