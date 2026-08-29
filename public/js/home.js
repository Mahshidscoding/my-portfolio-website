document.addEventListener('DOMContentLoaded', function() {

    
    // Top navigation appearance on scroll
    const topNav = document.querySelector('.top-nav');
    const projectsSection = document.querySelector('.projects-title-section');
    
    // Hide nav initially
    topNav.style.transform = 'translateY(-100%)';
    topNav.style.opacity = '0';
    
    // Track if the nav is currently visible
    let navVisible = false;
    
    window.addEventListener('scroll', function() {
        const projectsPosition = projectsSection.getBoundingClientRect().top;
        
        if (projectsPosition <= 0 && !navVisible) {
            // Play the animation only when transitioning from hidden to visible
            navVisible = true;
            
            // Reset any existing animations
            topNav.style.animation = 'none';
            // Trigger reflow
            void topNav.offsetWidth;
            
            // Apply the pop-in animation
            topNav.style.animation = 'navPopIn 0.7s cubic-bezier(0.17, 0.67, 0.28, 1.25) forwards';
        } else if (projectsPosition > 0 && navVisible) {
            // Hide the nav when scrolling back up
            navVisible = false;
            
            // Reset any existing animations
            topNav.style.animation = 'none';
            // Trigger reflow
            void topNav.offsetWidth;
            
            // Apply the pop-out animation
            topNav.style.animation = 'navPopOut 0.5s ease forwards';
        }
    });
    
    // Initialize draggable functionality for windows
    interact('.plain').draggable({
        inertia: true,
        modifiers: [
            interact.modifiers.restrictRect({
                restriction: 'parent',
                endOnly: true
            })
        ],
        autoScroll: true,
        
        listeners: {
            start(event) {
                // Add dragging class
                event.target.classList.add('dragging');
                
                // Bring window to front
                const zIndex = getHighestZIndex() + 1;
                event.target.style.zIndex = zIndex;
            },
            
            move(event) {
                const target = event.target;
                
                // Get current position
                let x = parseFloat(target.getAttribute('data-x')) || 0;
                let y = parseFloat(target.getAttribute('data-y')) || 0;
                
                // Update position
                x += event.dx;
                y += event.dy;
                
                // Apply translation
                target.style.transform = `translate(${x}px, ${y}px)`;
                
                // Store updated position
                target.setAttribute('data-x', x);
                target.setAttribute('data-y', y);
            },
            
            end(event) {
                // Remove dragging class
                event.target.classList.remove('dragging');
            }
        }
    });


    
   
    
    // Custom cursor functionality
    const cursor = document.querySelector('.cursor');
    
    if (cursor) {
        // Follow the mouse with requestAnimationFrame for smoother movement
        let mouseX = 0;
        let mouseY = 0;
        
        document.addEventListener('mousemove', (e) => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        
        // Use requestAnimationFrame for smoother cursor movement
        function updateCursor() {
            cursor.style.left = `${mouseX}px`;
            cursor.style.top = `${mouseY}px`;
            requestAnimationFrame(updateCursor);
        }
        requestAnimationFrame(updateCursor);
        
        // Make cursor transform when hovering over interactive elements
        const interactiveElements = document.querySelectorAll('a, button, .project-card, .contact-button, .lets-chat-button, .nav-button, .title-icon, .icon-container, .draggable-window, .window-header');
        
        interactiveElements.forEach(element => {
            element.addEventListener('mouseenter', () => {
                cursor.style.width = '60px';
                cursor.style.height = '24px';
                cursor.style.borderRadius = '12px';
            });
            
            element.addEventListener('mouseleave', () => {
                cursor.style.width = '24px';
                cursor.style.height = '24px';
                cursor.style.borderRadius = '50%';
            });
        });
    }
    
// Fallback for browsers that don't support CSS scroll-driven animations
if (!CSS.supports('animation-timeline: view()')) {
    console.log("Using JS fallback for scroll animations");
    
    // Initialize GSAP ScrollTrigger if available
    if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
        gsap.registerPlugin(ScrollTrigger);
        
        // Apply similar clip-path animation to the title ONLY
        gsap.fromTo('.projects-title-section', 
            { 
                opacity: 0,
                clipPath: 'inset(100% 100% 0% 0%)' 
            },
            { 
                scrollTrigger: {
                    trigger: '.projects-title-section',
                    start: 'top 75%',
                    end: 'top 10%',
                    scrub: true
                },
                opacity: 1,
                clipPath: 'inset(0% 0% 0% 0%)',
                duration: 1.2
            }
        );
        
        // Removed the project card animations
        
    } else {
        // If GSAP is not available, use IntersectionObserver as fallback
        // Only for titles, not project cards
        const elements = document.querySelectorAll('.projects-title-section');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.style.opacity = '1';
                    entry.target.style.clipPath = 'inset(0 0 0 0)';
                    // Stop observing once animation is triggered
                    observer.unobserve(entry.target);
                }
            });
        }, { threshold: 0.1 });
        
        // Set initial styles and start observing
        elements.forEach(el => {
            el.style.opacity = '0';
            el.style.clipPath = 'inset(100% 100% 0 0)';
            el.style.transition = 'opacity 0.8s ease, clip-path 0.8s ease';
            observer.observe(el);
        });
    }
}
    

    
    // Call the overlay window initialization at the end of the document ready function
    initializeOverlayWindow();
});


function initializeOverlayWindow() {
    // Initialize the first overlay window
    const overlayWindow = document.getElementById('overlay-window');
    const overlayContainer = overlayWindow.querySelector('.overlay-image-container');
    
    if (!overlayWindow || !overlayContainer) {
        console.error('Overlay window or container not found');
        return;
    }
    
    // Set initial position attributes if they don't exist
    if (!overlayWindow.hasAttribute('data-x')) {
        overlayWindow.setAttribute('data-x', '0');
    }
    
    if (!overlayWindow.hasAttribute('data-y')) {
        overlayWindow.setAttribute('data-y', '0');
    }
    
    // Function to update overlay image position
    function updateOverlayImagePosition(window, container) {
        // Get the current translation values from data attributes
        const translateX = parseFloat(window.getAttribute('data-x')) || 0;
        const translateY = parseFloat(window.getAttribute('data-y')) || 0;
        
        // Apply the inverse translation to the image container
        container.style.transform = `translate(${-translateX}px, ${-translateY}px)`;
        
        // We don't need to update the fixed-png-layer as it stays in place
    }
    
    // Initialize the image position for first window
    updateOverlayImagePosition(overlayWindow, overlayContainer);
    
    // Now initialize the second overlay window
    const overlayWindow2 = document.getElementById('overlay-window-2');
    const overlayContainer2 = overlayWindow2 ? overlayWindow2.querySelector('.overlay-image-container') : null;
    
    if (overlayWindow2 && overlayContainer2) {
        // Set initial position attributes if they don't exist
        if (!overlayWindow2.hasAttribute('data-x')) {
            overlayWindow2.setAttribute('data-x', '0');
        }
        
        if (!overlayWindow2.hasAttribute('data-y')) {
            overlayWindow2.setAttribute('data-y', '0');
        }
        
        // Initialize the image position for second window
        updateOverlayImagePosition(overlayWindow2, overlayContainer2);
    }
    
    // Create a draggable interaction for both windows
    function makeWindowDraggable(windowId) {
        const windowElement = document.getElementById(windowId);
        const containerElement = windowElement.querySelector('.overlay-image-container');
        
        if (interact.isSet && interact.isSet(`#${windowId}`)) {
            interact(`#${windowId}`).unset();
        }
        
        interact(`#${windowId}`).draggable({
            inertia: false,
            listeners: {
                start(event) {
                    event.target.classList.add('dragging');
                    const zIndex = getHighestZIndex() + 1;
                    event.target.style.zIndex = zIndex;
                },
                
                move(event) {
                    const target = event.target;
                    let x = parseFloat(target.getAttribute('data-x')) || 0;
                    let y = parseFloat(target.getAttribute('data-y')) || 0;
                    
                    x += event.dx;
                    y += event.dy;
                    
                    target.style.transform = `translate(${x}px, ${y}px)`;
                    target.setAttribute('data-x', x);
                    target.setAttribute('data-y', y);
                    
                    // Only update the overlay container, not the fixed PNG
                    updateOverlayImagePosition(target, containerElement);
                },
                
                end(event) {
                    event.target.classList.remove('dragging');
                }
            }
        });
    }
    
    // Make both windows draggable
    makeWindowDraggable('overlay-window');
    if (overlayWindow2) {
        makeWindowDraggable('overlay-window-2');
    }
    
    // Handle window resize
    window.addEventListener('resize', function() {
        updateOverlayImagePosition(overlayWindow, overlayContainer);
        if (overlayWindow2 && overlayContainer2) {
            updateOverlayImagePosition(overlayWindow2, overlayContainer2);
        }
    });
}



    // Utility function to get highest z-index
    function getHighestZIndex() {
        const elements = document.querySelectorAll('.draggable-window, .draggable-icon');
        let highest = 0;
        
        elements.forEach(el => {
            const zIndex = parseInt(window.getComputedStyle(el).zIndex, 10);
            if (!isNaN(zIndex) && zIndex > highest) {
                highest = zIndex;
            }
        });
        
        return highest;
    }
    

    

// ===== Add this to your existing home.js file =====

// Fix for icon click jumping and double-click issues
// Fix for icon click jumping and horizontal layout on mobile
document.addEventListener('DOMContentLoaded', function() {
    // Function to check if we're on mobile
    const isMobile = () => window.innerWidth <= 768 || ('ontouchstart' in window);
    
// Create mobile icons wrapper if on mobile
function setupMobileIcons() {
    if (isMobile()) {
        // Create wrapper if it doesn't exist
        let wrapper = document.querySelector('.mobile-icons-wrapper');
        if (!wrapper) {
            wrapper = document.createElement('div');
            wrapper.className = 'mobile-icons-wrapper';
            
            // Apply positioning styles for bottom placement
            wrapper.style.position = 'absolute';
            wrapper.style.bottom = '40px';
            wrapper.style.left = '0';
            wrapper.style.right = '0';
            wrapper.style.width = '100%';
            wrapper.style.margin = '0';
            wrapper.style.padding = '15px 0';
            wrapper.style.display = 'flex';
            wrapper.style.justifyContent = 'center';
            wrapper.style.gap = '30px';
            wrapper.style.zIndex = '15';
            
            // Append to draggable container
            const container = document.querySelector('.draggable-container');
            if (container) {
                container.appendChild(wrapper);
            }
        }
        
        // Get all icons
        const icons = document.querySelectorAll('.draggable-icon');
        
        // Move icons to wrapper
        icons.forEach(icon => {
            if (!wrapper.contains(icon)) {
                wrapper.appendChild(icon);
                
                // Style the icon for mobile
                icon.style.position = 'relative';
                icon.style.width = '60px';
                icon.style.margin = '0';
                icon.style.padding = '0';
                icon.style.display = 'flex';
                icon.style.flexDirection = 'column';
                icon.style.alignItems = 'center';
                
                // Style the icon image
                const iconImg = icon.querySelector('.icon-img');
                if (iconImg) {
                    iconImg.style.width = '40px';
                    iconImg.style.height = '40px';
                }
                
                // Style the icon label
                const iconLabel = icon.querySelector('.icon-label');
                if (iconLabel) {
                    iconLabel.style.fontSize = '12px';
                    iconLabel.style.marginTop = '4px';
                }
            }
        });
    } else {
        // On desktop, move icons back to container if needed
        const wrapper = document.querySelector('.mobile-icons-wrapper');
        if (wrapper) {
            const container = document.querySelector('.draggable-container');
            if (container) {
                // Move icons back to main container
                while (wrapper.firstChild) {
                    container.appendChild(wrapper.firstChild);
                }
            }
            // Hide wrapper
            wrapper.style.display = 'none';
        }
    }
}
    
  
    
    // Add CSS for icon click effect
    function addStyles() {
        const styleEl = document.createElement('style');
        styleEl.innerHTML = `
            .draggable-icon.clicked {
                transform: scale(0.95) !important;
                transition: transform 0.2s ease !important;
            }
            
            .draggable-icon {
                transition: transform 0.2s ease !important;
            }
            
            .mobile-icons-wrapper {
                display: flex;
                flex-direction: row !important;
                flex-wrap: nowrap !important;
                justify-content: center !important;
                align-items: center !important;
                width: 100% !important;
                padding: 10px 0 !important;
                gap: 30px !important;
                margin: 25px 0 20px 0 !important;
            }
        `;
        document.head.appendChild(styleEl);
    }
    
    // Run on load
    setupMobileIcons();
    addStyles();
    
    // Run on resize
    window.addEventListener('resize', setupMobileIcons);
});








document.addEventListener('DOMContentLoaded', function() {
    // Function to set up all icons as simple navigation elements
    function setupNavIcons() {
        // Get all the icon elements
        const workIcon = document.getElementById('work-icon');
        const aboutIcon = document.getElementById('about-icon');
        const chatIcon = document.getElementById('chat-icon');
        
        // Remove draggable functionality completely
        if (interact && interact.isSet) {
            if (interact.isSet('#work-icon')) interact('#work-icon').unset();
            if (interact.isSet('#about-icon')) interact('#about-icon').unset();
            if (interact.isSet('#chat-icon')) interact('#chat-icon').unset();
        }
        
        // Remove all data attributes that might be leftover from draggable
        [workIcon, aboutIcon, chatIcon].forEach(icon => {
            if (icon) {
                icon.removeAttribute('data-x');
                icon.removeAttribute('data-y');
                
                // Clear any inline transform styles
                icon.style.transform = '';
                
                // Make sure position is appropriate
                if (window.innerWidth <= 768) {
                    icon.style.position = 'static';
                } else {
                    // On desktop, use absolute positioning from CSS
                    icon.style.position = 'absolute';
                }
                
                // Add click animation without affecting position
                icon.addEventListener('click', function(e) {
                    e.preventDefault();
                    
                    // Simple scale animation - same for all icons
                    this.classList.add('clicked');
                    
                    // Reset after animation
                    setTimeout(() => {
                        this.classList.remove('clicked');
                    }, 300);
                    
                    // Handle navigation based on icon
                    if (this.id === 'work-icon') {
                        // Scroll to work section
                        const workSection = document.querySelector('#work');
                        if (workSection) {
                            workSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    } 
                    else if (this.id === 'about-icon') {
                        // Navigate to about page
                        window.location.href = 'about.html';
                    } 
                    else if (this.id === 'chat-icon') {
                        // Scroll to contact section
                        const contactSection = document.querySelector('#contact');
                        if (contactSection) {
                            contactSection.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        }
                    }
                });
            }
        });
    }
    
    // Run the function once on load
    setupNavIcons();
    
    // Handle icon repositioning on mobile/desktop views
    window.addEventListener('resize', function() {
        // Update if we've changed device size
        setupNavIcons();
    });
});



// Add this function to your home.js file
function animateOverlayWindows() {
    // Get overlay windows
    const verySerious = document.getElementById('overlay-window');
    const takeABreak = document.getElementById('overlay-window-2');
    
    // Set initial delay before starting animation
    const initialDelay = 500; // 500ms after page load (was 800ms)
    
    // Animation properties
    const animationDuration = 2200; // ms for one direction (was 3000ms)
    const pauseDuration = 100; // ms pause at maximum distance (was 200ms)
    const maxDrift = 55; // maximum pixels to move in each direction (increased from 35)
    
    // Store animation IDs for cancellation
    let verySerious_animationId = null;
    let takeABreak_animationId = null;
    
    // Animation state tracking
    let verySerious_animating = false;
    let takeABreak_animating = false;
    
    // Function to animate the very.serious window (up and left with looping)
    function animateVerySerious() {
        if (!verySerious) return;
        
        // Mark as animating
        verySerious_animating = true;
        
        // Get initial position or initialize to 0
        const initialX = parseFloat(verySerious.getAttribute('data-x')) || 0;
        const initialY = parseFloat(verySerious.getAttribute('data-y')) || 0;
        
        // Create a loop animation function
        function loopAnimation() {
            if (!verySerious_animating) return; // Stop if no longer animating
            
            // Move out (more up, less left)
            animateMove(
                verySerious, 
                initialX, initialY, 
                initialX - (maxDrift * 0.4), initialY - (maxDrift * 1.3), // More vertical movement
                animationDuration, 
                "easeInOut",
                () => {
                    if (!verySerious_animating) return; // Check if still animating
                    
                    // Pause at maximum distance
                    setTimeout(() => {
                        if (!verySerious_animating) return; // Check if still animating
                        
                        // Move back to original position
                        animateMove(
                            verySerious, 
                            initialX - (maxDrift * 0.4), initialY - (maxDrift * 1.3),
                            initialX, initialY, 
                            animationDuration, 
                            "easeInOut",
                            () => {
                                if (!verySerious_animating) return; // Check if still animating
                                
                                // Pause at original position
                                setTimeout(() => {
                                    if (verySerious_animating) {
                                        loopAnimation(); // Restart the loop if still animating
                                    }
                                }, pauseDuration);
                            }
                        );
                    }, pauseDuration);
                }
            );
        }
        
        // Start the animation loop after delay
        setTimeout(() => {
            loopAnimation();
            
            // Add click listener to stop animation
            verySerious.addEventListener('mousedown', stopVerySeriousAnimation);
        }, 500); // Reduced from 800ms
    }
    
    // Function to stop the very.serious animation
    function stopVerySeriousAnimation() {
        verySerious_animating = false;
        if (verySerious_animationId) {
            cancelAnimationFrame(verySerious_animationId);
            verySerious_animationId = null;
        }
        
        // Remove transition to prevent issues with interact.js dragging
        verySerious.style.transition = '';
        
        // Optional: Remove the click listener to prevent multiple calls
        verySerious.removeEventListener('mousedown', stopVerySeriousAnimation);
    }
    
    // Function to animate the take.a.break window (down and right with looping)
    function animateTakeABreak() {
        if (!takeABreak) return;
        
        // Mark as animating
        takeABreak_animating = true;
        
        // Get initial position or initialize to 0
        const initialX = parseFloat(takeABreak.getAttribute('data-x')) || 0;
        const initialY = parseFloat(takeABreak.getAttribute('data-y')) || 0;
        
        // Create a loop animation function
        function loopAnimation() {
            if (!takeABreak_animating) return; // Stop if no longer animating
            
            // Move out (down and right)
            animateMove(
                takeABreak, 
                initialX, initialY, 
                initialX + maxDrift, initialY + maxDrift, 
                animationDuration, 
                "easeInOut",
                () => {
                    if (!takeABreak_animating) return; // Check if still animating
                    
                    // Pause at maximum distance
                    setTimeout(() => {
                        if (!takeABreak_animating) return; // Check if still animating
                        
                        // Move back to original position
                        animateMove(
                            takeABreak, 
                            initialX + maxDrift, initialY + maxDrift, 
                            initialX, initialY, 
                            animationDuration, 
                            "easeInOut",
                            () => {
                                if (!takeABreak_animating) return; // Check if still animating
                                
                                // Pause at original position
                                setTimeout(() => {
                                    if (takeABreak_animating) {
                                        loopAnimation(); // Restart the loop if still animating
                                    }
                                }, pauseDuration);
                            }
                        );
                    }, pauseDuration);
                }
            );
        }
        
        // Start the animation loop after delay
        setTimeout(() => {
            loopAnimation();
            
            // Add click listener to stop animation
            takeABreak.addEventListener('mousedown', stopTakeABreakAnimation);
        }, 700); // Slightly later start for visual interest (reduced from initialDelay + 400)
    }
    
    // Function to stop the take.a.break animation
    function stopTakeABreakAnimation() {
        takeABreak_animating = false;
        if (takeABreak_animationId) {
            cancelAnimationFrame(takeABreak_animationId);
            takeABreak_animationId = null;
        }
        
        // Remove transition to prevent issues with interact.js dragging
        takeABreak.style.transition = '';
        
        // Optional: Remove the click listener to prevent multiple calls
        takeABreak.removeEventListener('mousedown', stopTakeABreakAnimation);
    }
    
    // Helper function to animate an element from one position to another
    function animateMove(element, startX, startY, endX, endY, duration, easing, onComplete) {
        // Store start time
        const startTime = performance.now();
        
        // Get the overlay container for background image positioning
        const container = element.querySelector('.overlay-image-container');
        
        // Use GSAP if available for smoother animation
        if (typeof gsap !== 'undefined') {
            // Cancel any existing animation on this element
            gsap.killTweensOf(element);
            
            // Create new animation
            gsap.fromTo(element, 
                { x: startX, y: startY },
                { 
                    x: endX, 
                    y: endY, 
                    duration: duration / 1000, 
                    ease: easing === "easeInOut" ? "power2.inOut" : "power2.out",
                    onUpdate: function() {
                        // Update data attributes during animation
                        const currentX = gsap.getProperty(element, 'x');
                        const currentY = gsap.getProperty(element, 'y');
                        
                        element.setAttribute('data-x', currentX);
                        element.setAttribute('data-y', currentY);
                        
                        // Update the overlay image position
                        if (container) {
                            container.style.transform = `translate(${-currentX}px, ${-currentY}px)`;
                        }
                    },
                    onComplete: onComplete
                }
            );
        } else {
            // Fallback to CSS transitions and requestAnimationFrame
            element.style.transition = `transform ${duration}ms ${easing === "easeInOut" ? "cubic-bezier(0.45, 0, 0.55, 1)" : "cubic-bezier(0.25, 0.1, 0.25, 1)"}`;
            
            // Set initial transform
            element.style.transform = `translate(${startX}px, ${startY}px)`;
            element.setAttribute('data-x', startX);
            element.setAttribute('data-y', startY);
            
            // Update the overlay image position
            if (container) {
                container.style.transition = `transform ${duration}ms ${easing === "easeInOut" ? "cubic-bezier(0.45, 0, 0.55, 1)" : "cubic-bezier(0.25, 0.1, 0.25, 1)"}`;
                container.style.transform = `translate(${-startX}px, ${-startY}px)`;
            }
            
            // Wait for next frame to apply the end position
            requestAnimationFrame(() => {
                // Apply the end transform
                element.style.transform = `translate(${endX}px, ${endY}px)`;
                element.setAttribute('data-x', endX);
                element.setAttribute('data-y', endY);
                
                // Update the overlay image position
                if (container) {
                    container.style.transform = `translate(${-endX}px, ${-endY}px)`;
                }
                
                // Call onComplete after the animation finishes
                setTimeout(onComplete, duration);
            });
        }
    }
    
    // Run both animations
    animateVerySerious();
    animateTakeABreak();
    
    // Also stop animations when starting to drag (better user experience)
    if (interact && interact.isSet) {
        // Check if interact.js is being used for dragging
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.target.classList.contains('dragging')) {
                    // Stop animations when dragging starts
                    stopVerySeriousAnimation();
                    stopTakeABreakAnimation();
                }
            });
        });
        
        // Observe class changes on both windows
        if (verySerious) {
            observer.observe(verySerious, { attributes: true, attributeFilter: ['class'] });
        }
        if (takeABreak) {
            observer.observe(takeABreak, { attributes: true, attributeFilter: ['class'] });
        }
    }
}

// Call this function when the document is ready
document.addEventListener('DOMContentLoaded', function() {
    // Wait for other scripts to initialize first
    setTimeout(animateOverlayWindows, 100);
});