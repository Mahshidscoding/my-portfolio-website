// Function to detect touch device
function isTouchDevice() {
    return (('ontouchstart' in window) ||
        (navigator.maxTouchPoints > 0) ||
        (navigator.msMaxTouchPoints > 0));
}

// Function to position windows for mobile view
function positionWindowsForMobile() {
    // Position the hello window
    const helloWindow = document.getElementById('hello-window');
    if (helloWindow) {
        helloWindow.style.position = 'relative';
        helloWindow.style.top = 'auto';
        helloWindow.style.left = 'auto';
        helloWindow.style.transform = 'none';
        helloWindow.style.margin = '20px auto 10px auto'; // Reduced bottom margin
        helloWindow.style.width = '85%';
        helloWindow.style.maxWidth = '280px'; // Reduced size
        
        // Remove any transform or translation attributes
        helloWindow.removeAttribute('data-x');
        helloWindow.removeAttribute('data-y');
    }
    
    // Keep only hello-image-1 on mobile
    const imageWindow1 = document.getElementById('hello-image-1');
    
    if (imageWindow1) {
        imageWindow1.style.position = 'relative';
        imageWindow1.style.top = 'auto';
        imageWindow1.style.left = 'auto';
        imageWindow1.style.margin = '10px auto'; // Reduced margin
        imageWindow1.style.width = '85%';
        imageWindow1.style.maxWidth = '280px'; // Reduced size
        imageWindow1.removeAttribute('data-x');
        imageWindow1.removeAttribute('data-y');
        imageWindow1.style.display = 'block'; // Ensure it's visible
    }
    
    // Create or get the mobile icons container
    let iconsContainer;
    
    if (!document.querySelector('.mobile-icons-container')) {
        // Create container if it doesn't exist
        iconsContainer = document.createElement('div');
        iconsContainer.className = 'mobile-icons-container';
        
        // Add the container to the draggable-container
        const draggableContainer = document.querySelector('.draggable-container');
        if (draggableContainer) {
            draggableContainer.appendChild(iconsContainer);
        }
    } else {
        // Get existing container
        iconsContainer = document.querySelector('.mobile-icons-container');
    }
    
    // Ensure the container has the right styles for horizontal layout
    if (iconsContainer) {
        // Set strict horizontal layout styles
        iconsContainer.style.display = 'flex';
        iconsContainer.style.flexDirection = 'row';
        iconsContainer.style.flexWrap = 'nowrap';
        iconsContainer.style.justifyContent = 'center';
        iconsContainer.style.alignItems = 'center';
        iconsContainer.style.width = '100%';
        iconsContainer.style.marginTop = '25px';
        iconsContainer.style.marginBottom = '20px';
        iconsContainer.style.padding = '10px 0';
        iconsContainer.style.gap = '30px'; // Add space between icons
    }
    
    // Position each icon inside the container
    const icons = document.querySelectorAll('.draggable-icon');
    icons.forEach(icon => {
        // Reset positioning
        icon.style.position = 'relative';
        icon.style.bottom = 'auto';
        icon.style.left = 'auto';
        icon.style.right = 'auto';
        icon.style.transform = 'none';
        
        // Make icons smaller
        icon.style.width = '60px';
        icon.style.margin = '0';
        icon.style.padding = '0';
        icon.style.display = 'flex';
        icon.style.flexDirection = 'column';
        icon.style.alignItems = 'center';
        
        // Make the icon image smaller
        const iconImg = icon.querySelector('.icon-img');
        if (iconImg) {
            iconImg.style.width = '40px';
            iconImg.style.height = '40px';
        }
        
        // Make the icon label smaller
        const iconLabel = icon.querySelector('.icon-label');
        if (iconLabel) {
            iconLabel.style.fontSize = '12px';
            iconLabel.style.marginTop = '4px';
        }
        
        // Remove drag attributes
        icon.removeAttribute('data-x');
        icon.removeAttribute('data-y');
        
        // Move to the container
        if (iconsContainer) {
            iconsContainer.appendChild(icon);
        }
    });
}

// Add CSS to the document to ensure horizontal layout
function addMobileIconStyles() {
    // Create a style element if it doesn't exist
    if (!document.getElementById('mobile-icon-styles')) {
        const styleEl = document.createElement('style');
        styleEl.id = 'mobile-icon-styles';
        
        // Add styles to force horizontal layout
        styleEl.textContent = `
            @media (max-width: 768px), (pointer: coarse) {
                .mobile-icons-container {
                    display: flex !important;
                    flex-direction: row !important;
                    flex-wrap: nowrap !important;
                    justify-content: center !important;
                    align-items: center !important;
                    width: 100% !important;
                    padding: 10px 0 !important;
                    gap: 30px !important;
                    margin: 25px 0 20px 0 !important;
                }
                
                .mobile-icons-container .draggable-icon {
                    width: 60px !important;
                    margin: 0 !important;
                    padding: 0 !important;
                }
                
                .mobile-icons-container .icon-img {
                    width: 40px !important;
                    height: 40px !important;
                }
                
                .mobile-icons-container .icon-label {
                    font-size: 12px !important;
                    margin-top: 4px !important;
                }
            }
        `;
        
        // Add to document head
        document.head.appendChild(styleEl);
    }
}

// Initialize everything when the DOM is loaded
document.addEventListener('DOMContentLoaded', function() {
    // Add styles regardless to make sure they're applied
    addMobileIconStyles();
    
    // Add a class to the body if it's a touch device
    if (isTouchDevice() || window.innerWidth <= 768) {
        document.body.classList.add('touch-device');
        
        // Disable the draggable functionality for windows on touch devices
        if (typeof interact !== 'undefined') {
            interact('.draggable-window').unset();
            interact('.draggable-icon').unset();
        }
        
        // Position the windows in a fixed layout for mobile
        positionWindowsForMobile();
    }
    
    // Handle window resize events for responsive layout updates
    window.addEventListener('resize', function() {
        if (isTouchDevice() || window.innerWidth <= 768) {
            positionWindowsForMobile();
        }
    });
});