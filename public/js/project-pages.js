    /**
 * project-pages.js
 * Combined JavaScript for all project pages
 * This file handles custom cursor, smooth scrolling, and parallax effects
 * For use on individual project pages (not the homepage)
 */

document.addEventListener('DOMContentLoaded', function() {
    // ======================
    // 1. Custom Cursor Effect
    // ======================
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
        const interactiveElements = document.querySelectorAll('a, button, .project-card, .contact-button, .lets-chat-button, .nav-button, .title-icon, .icon-container');
        
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

    // ======================
    // 2. Smooth Scrolling for Internal Links
    // ======================
    const smoothScrollLinks = document.querySelectorAll('a[href^="#"]');
    
    smoothScrollLinks.forEach(link => {
        link.addEventListener('click', function(e) {
            e.preventDefault();
            
            // Get the target section ID from the href attribute
            const targetId = this.getAttribute('href');
            
            // Only proceed if the href is not just "#" (which would scroll to top)
            if(targetId !== '#') {
                const targetSection = document.querySelector(targetId);
                
                if (targetSection) {
                    // Calculate position to scroll to (with offset for header)
                    const headerOffset = 50; // Middle value between your different offsets
                    const targetPosition = targetSection.getBoundingClientRect().top + 
                                        window.pageYOffset - headerOffset;
                    
                    // Perform the smooth scroll
                    window.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }
        });
    });

    // ======================
    // 3. Parallax Effect
    // ======================
    // Elements
    const heroSection = document.querySelector('.project-hero');
    const heroImage = document.querySelector('.project-hero-image');
    const heroImg = heroImage ? heroImage.querySelector('img') : null;
    const infoSection = document.querySelector('.project-info');
    const parallaxContainer = document.querySelector('.parallax-container');
    
    // Only execute parallax if all required elements exist
    if (heroSection && heroImg && infoSection && parallaxContainer) {
        // Ensure top nav is visible
        const topNav = document.querySelector('.top-nav');
        const floatingNav = document.querySelector('.floating-nav');
        
        if (topNav) {
            topNav.style.transform = 'none';
            topNav.style.opacity = '1';
            topNav.style.zIndex = '1000';
        }
        
        if (floatingNav) {
            floatingNav.style.zIndex = '1000';
        }
        
        // Adjusted timing values - reduced the gap
        const ZOOM_START = 0;        
        const ZOOM_END = 80;         
        const FIXED_END = 500;       
        const INFO_START = 30;      // Reduced from 120 to 80 to start earlier
        
        // Set up initial styles
        document.body.style.position = 'relative';
        
        // Style the parallax container to be fixed initially
        parallaxContainer.style.position = 'fixed';
        parallaxContainer.style.top = '0';
        parallaxContainer.style.left = '0';
        parallaxContainer.style.width = '100%';
        parallaxContainer.style.height = '100vh';
        parallaxContainer.style.zIndex = '1';
        parallaxContainer.style.opacity = '1'; // Start fully visible
        parallaxContainer.style.transition = 'opacity 0.15s ease-out';
        
        // Set initial image zoom
        heroImg.style.transform = 'scale(1.1)';
        heroImg.style.transformOrigin = 'center center';
        heroImg.style.transition = 'transform 0.05s ease-out';
        
        // Style info section for initial state (completely hidden, with transparent background)
        infoSection.style.position = 'relative';
        infoSection.style.zIndex = '2';
        infoSection.style.transform = 'translateY(100%)'; // Start fully below viewport
        infoSection.style.marginTop = '-80px';
        infoSection.style.background = 'transparent'; // Transparent background
        infoSection.style.transition = 'transform 0.1s ease-out';
        
        // Create spacer element
        const spacer = document.createElement('div');
        spacer.className = 'parallax-spacer';
        spacer.style.height = `${FIXED_END + 50}px`;
        document.body.insertBefore(spacer, document.body.firstChild);
        
        // Position the content after the hero+info sections
        const contentStart = document.querySelector('.project-images') || document.querySelector('.projects-container');
        if (contentStart) {
            contentStart.style.position = 'relative';
            contentStart.style.zIndex = '3';
            contentStart.style.marginTop = '50px';
        }
        
        // Scroll handler
        window.addEventListener('scroll', function() {
            const scrollTop = window.scrollY;
            
            // Handle image zoom effect
            if (scrollTop <= ZOOM_END) {
                const zoom = 1.1 - (scrollTop / ZOOM_END * 0.1);
                heroImg.style.transform = `scale(${zoom})`;
            } else {
                heroImg.style.transform = 'scale(1.0)';
            }
            
            // Handle info section slide up effect and fade out hero
            if (scrollTop >= INFO_START) {
                // Info section sliding up - faster transition (100 instead of 150)
                const progress = Math.min(1, (scrollTop - INFO_START) / 100);
                const translateY = 100 - (progress * 100);
                infoSection.style.transform = `translateY(${translateY}%)`;
                
                // Hero fade out effect - fade completely when info section is 50% visible (changed from 30%)
                const fadeThreshold = 0.5;
                const opacityValue = progress <= fadeThreshold ? 1 - (progress / fadeThreshold) : 0;
                parallaxContainer.style.opacity = opacityValue.toString();
            } else {
                infoSection.style.transform = 'translateY(100%)';
                parallaxContainer.style.opacity = '1';
            }
            
            // Release fixed positioning after threshold
            if (scrollTop >= FIXED_END) {
                parallaxContainer.style.position = 'absolute';
                parallaxContainer.style.top = `${FIXED_END}px`;
            } else {
                parallaxContainer.style.position = 'fixed';
                parallaxContainer.style.top = '0';
            }
        });
        
        // Ensure the page loads at the top
        window.scrollTo(0, 0);
    }
    
    
    // ======================
    // 4. Contact Buttons Functionality
    // ======================

document.getElementById('copy-email-button').addEventListener('click', function(e) {
    e.preventDefault();
    
    // Your email address
    const email = 'mahshidmdnn@gmail.com';
    
    // Copy to clipboard using modern Clipboard API
    navigator.clipboard.writeText(email).then(() => {
        const button = this;
        const textElement = button.querySelector('.contact-button-text');
        
        // Save original text
        const originalText = textElement.textContent;
        
        // Update text and add selected and copied classes
        textElement.textContent = 'Copied!';
        button.classList.add('selected', 'copied');
        
        // Reset after 1 second
        setTimeout(() => {
            textElement.textContent = originalText;
            button.classList.remove('selected', 'copied');
        }, 1000);
    }).catch(err => {
        console.error('Could not copy email: ', err);
    });
});

// For Book call button - add selected state temporarily when clicked
document.getElementById('book-call-button').addEventListener('click', function(e) {
    e.preventDefault();
    
    // Add selected class
    this.classList.add('selected');
    
    // Remove after a short delay
    setTimeout(() => {
        this.classList.remove('selected');
        // Replace with your calendar booking link
        window.open('https://calendly.com/mahshidmdnn/30min', '_blank');
    }, 300);
});

// Add temporary selected state for LinkedIn and Dribbble buttons
document.querySelectorAll('.contact-button:nth-child(3), .contact-button:nth-child(4)').forEach(button => {
    button.addEventListener('click', function() {
        // Save reference to this
        const self = this;
        
        // Add selected class
        self.classList.add('selected');
            
        setTimeout(() => {
            self.classList.remove('selected');
        }, 300);
    });
});


});

