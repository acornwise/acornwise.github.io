document.addEventListener('DOMContentLoaded', function () {
    const categorySelect = document.getElementById('category-select');
    const newQuestionButton = document.getElementById('new-question-button');
    const questionIdInput = document.getElementById('question-id-input');
    const getQuestionByIdButton = document.getElementById('get-question-by-id-button');
    const challengeContainer = document.getElementById('challenge-container');
    const pyodideLoader = document.getElementById('pyodide-loader');
    const resetProgressButton = document.getElementById('reset-progress-button');
    
    // Mobile menu setup
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    if (mobileMenuButton) {
         mobileMenu.innerHTML = `<a href="index.html" class="block py-2 px-4 text-sm text-gray-700 hover:bg-gray-100">Home</a>
            <a href="courses.html" class="block py-2 px-4 text-sm text-gray-700 hover:bg-gray-100">Our Courses</a>
            <a href="resources.html" class="block py-2 px-4 text-sm text-indigo-600 bg-indigo-50 font-semibold">Learning Resources</a>
            <a href="practice_problems.html" class="block py-2 pl-8 pr-4 text-sm text-gray-700 bg-gray-100">Practice Problems</a>
            <a href="online_editor.html" class="block py-2 pl-8 pr-4 text-sm text-gray-700 hover:bg-gray-100">Online Python Editor</a>
            <a href="cheat_sheet.html" class="block py-2 pl-8 pr-4 text-sm text-gray-700 hover:bg-gray-100">Python Cheat Sheet</a>
            <a href="timetable.html" class="block py-2 px-4 text-sm text-gray-700 hover:bg-gray-100">Timetable & Fees</a>
            <a href="contact.html" class="block py-2 px-4 text-sm text-gray-700 hover:bg-gray-100">Contact Us</a>`;
        mobileMenuButton.addEventListener('click', () => mobileMenu.classList.toggle('hidden'));
    }

    let masterQuestionList = [];
    let solvedQuestions = new Set(JSON.parse(localStorage.getItem('solvedQuestions') || '[]'));
    let currentQuestion = null;
    let pyodide = null;
    let editor = null;
    
    const categories = [
        "Abstraction", "Algorithms", "Decomposition", "Evaluation", 
        "Modelling and Simulation", "Pattern Recognition"
    ];

    async function loadAllQuestions() {
        try {
            const fetchPromises = categories.map(category =>
                fetch(`questions/${category.replace(/ /g, '%20')}.json`)
                    .then(res => {
                        if (!res.ok) console.warn(`Could not load questions for category: ${category}`);
                        return res.ok ? res.json() : [];
                    })
            );
            const questionArrays = await Promise.all(fetchPromises);
            masterQuestionList = questionArrays.flat().filter(q => q && q.id);

            // Populate category dropdown
            categories.forEach(category => {
                if (masterQuestionList.some(q => q.category === category)) {
                    const option = document.createElement('option');
                    option.value = category;
                    option.textContent = category;
                    categorySelect.appendChild(option);
                }
            });
        } catch (error) {
            console.error("Fatal error loading question files:", error);
            pyodideLoader.textContent = 'Error: Could not load practice problems.';
            pyodideLoader.classList.remove('text-indigo-600');
            pyodideLoader.classList.add('text-red-600');
        }
    }

    async function initialize() {
        // Run Pyodide and question loading in parallel
        const pyodidePromise = loadPyodide().then(p => {
            pyodide = p;
        });
        const questionsPromise = loadAllQuestions();

        await Promise.all([pyodidePromise, questionsPromise]);

        pyodideLoader.textContent = 'Python Environment & Questions Ready!';
        setTimeout(() => pyodideLoader.style.display = 'none', 2000);
        
        getNewQuestion(); // Display the first question
    }
    
    initialize();

    function displayQuestion(question) {
        currentQuestion = question;
        challengeContainer.innerHTML = '';
        if (!question) {
            challengeContainer.innerHTML = `<div class="col-span-full text-center text-gray-600 p-8">
                <h3 class="text-xl font-semibold mb-2">All questions in this category are solved!</h3>
                <p>Try another category or reset your progress to practice again.</p>
            </div>`;
            return;
        }

        if (typeof question.title !== 'string' || typeof question.description_md !== 'string') {
            challengeContainer.innerHTML = `<div class="col-span-full text-center text-red-600 font-semibold">Error loading question. Data is incomplete. Please try a new question.</div>`;
            return;
        }

        const descriptionHTML = question.description_md.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');

        const testCasesHTML = (question.test_cases || []).map((tc, index) => {
            const formattedInput = (tc.input || []).join('\n');
            return `
            <tbody id="test-case-group-${index}">
                <tr id="test-case-row-${index}" data-index="${index}">
                    <td class="border px-4 py-2 font-mono text-sm">${formattedInput || '""'}</td>
                    <td class="border px-4 py-2 font-mono text-sm">${tc.expected_output}</td>
                    <td class="border px-4 py-2 text-center" id="test-case-result-${index}">-</td>
                </tr>
                <tr id="test-case-details-${index}" class="hidden">
                    <td colspan="3" class="p-3 border-x border-b border-red-200 bg-red-50">
                        <pre class="text-xs text-red-900 whitespace-pre-wrap font-mono" id="details-content-${index}"></pre>
                    </td>
                </tr>
            </tbody>`;
        }).join('');
        
        const problemDescriptionPanel = `
            <div id="problem-col">
                <h2 class="text-2xl font-bold text-gray-900 mb-2">${question.title}</h2>
                <p class="text-sm text-gray-500 mb-4 items-center">Category: ${question.category} | ID: 
                    <button id="question-id-display" name="copy-question-id" class="font-mono bg-gray-100 p-1 rounded cursor-pointer text-left focus:outline-none focus:ring-2 focus:ring-indigo-500" title="Click to copy">
                        ${question.id}
                    </button>
                </p>
                <div class="prose max-w-none text-gray-700 leading-relaxed mb-6">${descriptionHTML}</div>
                <h3 class="text-xl font-semibold text-gray-800 mt-8 mb-4">Test Cases</h3>
                <div class="overflow-x-auto">
                    <table class="table-auto w-full mb-6">
                        <thead><tr>
                            <th class="px-4 py-2 bg-gray-100 text-left">Input</th>
                            <th class="px-4 py-2 bg-gray-100 text-left">Expected Output</th>
                            <th class="px-4 py-2 bg-gray-100 text-left">Result</th>
                        </tr></thead>
                        ${testCasesHTML}
                    </table>
                </div>
            </div>
        `;

        const codingPanel = `
            <div id="editor-col">
                <h3 class="text-xl font-semibold text-gray-800 mb-4">Your Code</h3>
                <div id="editor"></div>
                <h3 class="text-xl font-semibold text-gray-800 mt-6 mb-4">Input</h3>
                <textarea id="code-input" name="code-input" class="w-full h-24 p-2 border border-gray-300 rounded-md font-mono text-sm" placeholder="Enter input for your code here..."></textarea>
                <div class="flex flex-col sm:flex-row gap-4 mt-4">
                    <button id="run-code" name="run-code" class="flex-1 bg-gray-700 text-white font-semibold py-2 px-6 rounded-lg hover:bg-gray-800 transition">Run with Input</button>
                    <button id="check-answer" name="check-answer" class="flex-1 bg-indigo-600 text-white font-semibold py-2 px-6 rounded-lg hover:bg-indigo-700 transition">Check Against Test Cases</button>
                </div>
                <h3 class="text-xl font-semibold text-gray-800 mt-6 mb-4">Output</h3>
                <pre id="code-output" class="w-full min-h-[80px] p-4 border bg-gray-50 border-gray-200 rounded-md font-mono text-sm whitespace-pre-wrap"></pre>
            </div>
        `;

        challengeContainer.innerHTML = problemDescriptionPanel + codingPanel;

        const idDisplay = document.getElementById('question-id-display');
        if (idDisplay) {
            idDisplay.addEventListener('click', () => {
                const id = currentQuestion.id;
                navigator.clipboard.writeText(id).then(() => {
                    const originalText = idDisplay.textContent.trim();
                    idDisplay.textContent = 'Copied!';
                    setTimeout(() => { idDisplay.textContent = originalText; }, 1500);
                });
            });
        }

        editor = ace.edit("editor");
        editor.setTheme("ace/theme/chrome");
        editor.session.setMode("ace/mode/python");
        editor.setValue((question.starter_code || '# Start your code here').trim(), -1);

        document.getElementById('run-code').addEventListener('click', runCode);
        document.getElementById('check-answer').addEventListener('click', checkAnswer);

        const testCaseTable = challengeContainer.querySelector('#problem-col table');
        if (testCaseTable) {
            testCaseTable.addEventListener('click', (event) => {
                const row = event.target.closest('tr[data-index]');
                if (row && row.dataset.failed === 'true') {
                    const index = row.dataset.index;
                    const detailsRow = document.getElementById(`test-case-details-${index}`);
                    if (detailsRow) detailsRow.classList.toggle('hidden');
                }
            });
        }
    }

    function getNewQuestion() {
        if (!pyodide) return;
        const selectedCategory = categorySelect.value;
        
        let questionsForCategory;
        if (selectedCategory === 'All') {
            questionsForCategory = masterQuestionList;
        } else {
            questionsForCategory = masterQuestionList.filter(q => q.category === selectedCategory);
        }

        let potentialQuestions = questionsForCategory.filter(q => !solvedQuestions.has(q.id));

        if (potentialQuestions.length === 0) {
            displayQuestion(null);
            return;
        }
        
        if (potentialQuestions.length > 1 && currentQuestion) {
            const filtered = potentialQuestions.filter(q => q.id !== currentQuestion.id);
            if (filtered.length > 0) {
                potentialQuestions = filtered;
            }
        }
        
        const randomIndex = Math.floor(Math.random() * potentialQuestions.length);
        displayQuestion(potentialQuestions[randomIndex]);
    }
    
    function getQuestionById(id) {
        if (!pyodide) return;
        const found = masterQuestionList.find(q => q.id === id);
        if (found) {
            categorySelect.value = found.category;
            displayQuestion(found);
        } else {
            challengeContainer.innerHTML = `<div class="col-span-full text-center text-red-600 font-semibold">Question with ID "${id}" not found.</div>`;
        }
    }

    async function runCodeWithInput(code, input) {
        if (!pyodide) return "Pyodide not initialized";
        try {
            pyodide.globals.set('custom_input', input);
            return await pyodide.runPythonAsync(`
import sys
from io import StringIO
sys.stdin = StringIO(custom_input)
old_stdout = sys.stdout
sys.stdout = captured_output = StringIO()
try:
    exec(${JSON.stringify(code)})
finally:
    sys.stdout = old_stdout
return captured_output.getvalue()
            `);
        } catch (e) {
            return `Error: ${e.message}`;
        }
    }

    async function runCode() {
        const code = editor.getValue();
        const input = document.getElementById('code-input').value;
        const outputEl = document.getElementById('code-output');
        outputEl.textContent = 'Running...';
        const result = await runCodeWithInput(code, input);
        outputEl.textContent = result || '(No output)';
    }

    async function checkAnswer() {
        if (!currentQuestion || !currentQuestion.test_cases) return;
        const code = editor.getValue();
        const testCases = currentQuestion.test_cases;
        let allPassed = true;
        
        for(let i = 0; i < testCases.length; i++) {
            const tc = testCases[i];
            const row = document.getElementById(`test-case-row-${i}`);
            const resultEl = document.getElementById(`test-case-result-${i}`);
            resultEl.textContent = 'Running...';
            
            const formattedInput = (tc.input || []).join('\n');
            const actualOutput = await runCodeWithInput(code, formattedInput);
            
            const formattedResult = actualOutput.trim();
            const formattedExpected = tc.expected_output.trim();

            if (formattedResult === formattedExpected) {
                resultEl.textContent = '✅ Passed';
                resultEl.className = 'border px-4 py-2 text-center text-green-600 font-semibold';
                row.dataset.failed = 'false';
            } else {
                allPassed = false;
                resultEl.textContent = '❌ Failed';
                resultEl.className = 'border px-4 py-2 text-center text-red-600 font-semibold cursor-pointer';
                row.dataset.failed = 'true';
                
                const detailsRow = document.getElementById(`test-case-details-${i}`);
                const detailsContent = document.getElementById(`details-content-${i}`);
                if(detailsContent) {
                    detailsContent.textContent = `Expected:\n${formattedExpected}\n\nActual:\n${formattedResult}`;
                }
            }
        }
        
        if (allPassed) {
            solvedQuestions.add(currentQuestion.id);
            localStorage.setItem('solvedQuestions', JSON.stringify([...solvedQuestions]));
            
            let successMsg = challengeContainer.querySelector('.success-message');
            if (!successMsg) {
                successMsg = document.createElement('div');
                successMsg.className = 'success-message col-span-full text-center text-green-600 font-bold text-lg mt-4';
                challengeContainer.appendChild(successMsg);
            }
            successMsg.textContent = 'Congratulations! All test cases passed!';
        }
    }

    newQuestionButton.addEventListener('click', getNewQuestion);
    categorySelect.addEventListener('change', getNewQuestion);
    getQuestionByIdButton.addEventListener('click', () => {
        const id = questionIdInput.value.trim();
        if (id) getQuestionById(id);
    });
    resetProgressButton.addEventListener('click', () => {
        solvedQuestions.clear();
        localStorage.removeItem('solvedQuestions');
        const originalText = resetProgressButton.textContent;
        resetProgressButton.textContent = 'Progress Reset!';
        resetProgressButton.disabled = true;
        setTimeout(() => {
            resetProgressButton.textContent = originalText;
            resetProgressButton.disabled = false;
        }, 2000);
        getNewQuestion();
    });
});

