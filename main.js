// This script loads the header and footer, and handles navigation logic like active links and the mobile menu.
document.addEventListener('DOMContentLoaded', function() {
    
    const loadComponent = (url, placeholderId, callback) => {
        fetch(url)
            .then(response => {
                if (!response.ok) {
                    throw new Error(`Failed to load component: ${url}`);
                }
                return response.text();
            })
            .then(data => {
                const placeholder = document.getElementById(placeholderId);
                if (placeholder) {
                    placeholder.innerHTML = data;
                    if (callback) {
                        callback();
                    }
                }
            })
            .catch(error => {
                console.error(error);
                const placeholder = document.getElementById(placeholderId);
                if (placeholder) {
                    placeholder.innerHTML = `<p class="text-red-500 text-center">Error: Could not load ${placeholderId.replace('-placeholder', '')}.</p>`;
                }
            });
    };

    // Load Header and then set up its interactive elements
    loadComponent('header.html', 'header-placeholder', () => {
        setActiveNavLink();
        setupMobileMenu();
        setupDropdownMenu();
    });

    // Load Footer
    loadComponent('footer.html', 'footer-placeholder');
});

function setActiveNavLink() {
    // Determine the current page's filename
    const currentPage = window.location.pathname.split('/').pop() || 'index.html';
    
    // Combine selectors for both desktop and mobile links
    const navLinks = document.querySelectorAll('#desktop-menu a, #mobile-menu a');

    const resourcePages = ['resources.html', 'daily_challenge.html', 'practice_problems.html', 'online_editor.html', 'cheat_sheet.html'];

    navLinks.forEach(link => {
        const linkPage = link.getAttribute('href').split('/').pop();
        
        // Check if the current page is a resource page
        const isResourcePage = resourcePages.includes(currentPage);
        
        // Check if the current link is the main "Learning Resources" link
        const isResourcesParentLink = linkPage === 'resources.html';

        if (linkPage === currentPage || (isResourcesParentLink && isResourcePage)) {
            // Apply active styles
            link.classList.add('text-indigo-600', 'font-semibold');
            link.classList.remove('text-gray-600');
        } else {
            // Ensure non-active links have the default style
            link.classList.remove('text-indigo-600', 'font-semibold');
            link.classList.add('text-gray-600');
        }
    });
}

function setupMobileMenu() {
    const mobileMenuButton = document.getElementById('mobile-menu-button');
    const mobileMenu = document.getElementById('mobile-menu');
    
    if (mobileMenuButton && mobileMenu) {
        mobileMenuButton.addEventListener('click', (event) => {
            event.stopPropagation();
            mobileMenu.classList.toggle('hidden');
        });
        
        // Optional: Close menu when clicking outside
        document.addEventListener('click', (event) => {
            if (!mobileMenu.contains(event.target) && !mobileMenuButton.contains(event.target)) {
                mobileMenu.classList.add('hidden');
            }
        });
    }
}

function setupDropdownMenu() {
    const container = document.getElementById('resources-dropdown-container');
    const button = document.getElementById('resources-dropdown-button');
    const menu = document.getElementById('resources-dropdown-menu');

    if (container && button && menu) {
        button.addEventListener('click', (event) => {
            // Prevent the link from navigating, allowing the dropdown to show
            event.preventDefault(); 
            menu.classList.toggle('hidden');
        });

        // Close the dropdown if the user clicks anywhere else on the page
        document.addEventListener('click', (event) => {
            if (!container.contains(event.target)) {
                menu.classList.add('hidden');
            }
        });
    }
}

