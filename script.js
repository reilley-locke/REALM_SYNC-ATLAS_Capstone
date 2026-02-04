
/* 
════════════════
⚠ DISCLAIMER ⚠
════════════════
This code was made with the help of A.I., specifically in regards to the WebSocket functionality because I could not get it working (likely a result of my absolute lack of WebSocket experience).

Since this was made during the testing phase of the project, and a lot of this code will likely not be in the final product, I feel like it was a justified use of A.I. as a tool.
*/


// ══════════════════════════════════
// SETUP AND INITIALIZATION
// ══════════════════════════════════

// Get references to DOM elements
const canvas = document.getElementById("canvas");
const ctx = canvas.getContext("2d");
const logBox = document.getElementById("log");
const statusTXT = document.getElementById("connectionStatus");
const userCountTXT = document.getElementById("userCount");
const yourColorTXT = document.getElementById("yourColor");

// Canvas resize handler - makes canvas fill the entire window
function resize() {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
}
resize();
window.addEventListener("resize", resize);

// ══════════════════════════════════
// LOGGING FUNCTIONS
// ══════════════════════════════════

/**
 * Log a message with a predefined color class
 * @param {string} msg - The message to log
 * @param {string} colorClass - CSS class for coloring (log-success, log-error, etc.)
 */
function log(msg, colorClass = '') {
    const time = new Date().toLocaleTimeString();
    const colorAttr = colorClass ? ` class="${colorClass}"` : '';
    logBox.innerHTML += `<br><span${colorAttr}>[${time}] ${msg}</span>`;
    logBox.scrollTop = logBox.scrollHeight; // Auto-scroll to bottom
}

/**
 * Log a message with a custom hex color (used for user-specific events)
 * @param {string} msg - The message to log
 * @param {string} color - Hex color code (e.g., "#ff5733")
 */
function logWithColor(msg, color) {
    const time = new Date().toLocaleTimeString();
    logBox.innerHTML += `<br><span style="color: ${color}">[${time}] ${msg}</span>`;
    logBox.scrollTop = logBox.scrollHeight; // Auto-scroll to bottom
}

// ══════════════════════════════════
// CLIENT IDENTIFICATION
// ══════════════════════════════════

// Generate a unique client ID (random alphanumeric string)
// This ID identifies this specific browser/device to other clients
const clientId = Math.random().toString(36).substr(2, 9);

// Generate a random color for this client's touches
// padStart ensures we always have a 6-digit hex color (e.g., #0f0f0f not #f0f0f)
const myColor = "#" + Math.floor(Math.random() * 16777215).toString(16).padStart(6, '0');

// Display the client's assigned color in the status panel
yourColorTXT.style.color = myColor;
yourColorTXT.textContent = myColor;

// ══════════════════════════════════
// TOUCH DATA STORAGE
// ══════════════════════════════════

// Map to store this client's active touches
// Key: touch identifier, Value: touch object {id, x, y, color}
let localTouches = new Map();

// Map to store other clients' touches
// Key: clientId (string), Value: {touches: Array, color: string}
// This allows us to track multiple users simultaneously
let remoteTouches = new Map();

// ══════════════════════════════════
// WEBSOCKET CONNECTION SETUP
// ══════════════════════════════════

// Determine the correct WebSocket protocol based on page protocol
// If page is HTTPS, use WSS (WebSocket Secure), otherwise use WS
// This ensures the WebSocket connection matches the page's security level
const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';

// Build the WebSocket URL using the current page's host
// This allows the code to work on any domain (localhost, Koyeb, etc.)
const wsUrl = `${protocol}//${window.location.host}`;

// WebSocket connection object - will be initialized in connect()
let socket;

// Interval ID for reconnection attempts - used to stop reconnection loop
let reconnectInterval;

/**
 * Establish WebSocket connection to the server
 * Handles connection, messaging, disconnection, and auto-reconnection
 */
function connect() {
    // Create a new WebSocket connection to the server
    socket = new WebSocket(wsUrl);

    // ══════════════════════════════════
    // WEBSOCKET EVENT: CONNECTION OPENED
    // ══════════════════════════════════
    // Fires when connection to server is successfully established
    socket.onopen = () => {
        log("Connected to server", "log-success");
        statusTXT.textContent = "Connected";
        statusTXT.className = "connected";

        // Clear any existing reconnection attempts since we're now connected
        clearInterval(reconnectInterval);

        // Update the user count display
        updateUserCount();
    };

    // ══════════════════════════════════
    // WEBSOCKET EVENT: MESSAGE RECEIVED
    // ══════════════════════════════════
    // Fires when server sends data to this client
    socket.onmessage = event => {
        // Parse the JSON message from the server
        const data = JSON.parse(event.data);

        // Handle "touchUpdate" message type
        // This contains another user's touch positions and color
        if (data.type === "touchUpdate") {
            // Store the remote user's touch data in our map
            // Key = their clientId, Value = {touches: array, color: hex}
            remoteTouches.set(data.clientId, {
                touches: data.touches,  // Array of touch objects
                color: data.color       // Their assigned color
            });

            // Log the update in the remote user's color
            logWithColor(`Update from user ${data.clientId.substr(0, 4)}: ${data.touches.length} touch(es)`, data.color);

            // Update the active user count since we have activity
            updateUserCount();
        }

        // Handle "clearTouches" message type
        // Sent when a user lifts all their fingers/releases mouse
        if (data.type === "clearTouches") {
            // Try to get the user's color before deleting their data
            const clientData = remoteTouches.get(data.clientId);
            const userColor = clientData ? clientData.color : '#888';

            // Remove this user's touches from our display
            remoteTouches.delete(data.clientId);

            // Log in their color that they cleared touches
            logWithColor(`User ${data.clientId.substr(0, 4)} cleared touches`, userColor);

            // Update user count since they're no longer active
            updateUserCount();
        }
    };

    // ══════════════════════════════════
    // WEBSOCKET EVENT: CONNECTION CLOSED
    // ══════════════════════════════════
    // Fires when connection is lost (server down, network issue, etc.)
    socket.onclose = () => {
        log("Disconnected from server", "log-error");
        statusTXT.textContent = "Disconnected";
        statusTXT.className = "disconnected";

        // Attempt to reconnect every 3 seconds
        // This creates a persistent connection that auto-recovers from failures
        reconnectInterval = setInterval(() => {
            log("Attempting to reconnect...", "log-reconnect");
            connect(); // Recursively call connect() to try again
        }, 3000);
    };

    // ══════════════════════════════════
    // WEBSOCKET EVENT: ERROR OCCURRED
    // ══════════════════════════════════
    // Fires when there's a WebSocket error (malformed data, connection issue, etc.)
    socket.onerror = error => {
        log("WebSocket error", "log-error");
        console.error('WebSocket error:', error);
    };
}

// ══════════════════════════════════
// INITIAL WEBSOCKET CONNECTION
// ══════════════════════════════════
// Start the connection when the page loads
connect();

// ══════════════════════════════════
// USER COUNT DISPLAY
// ══════════════════════════════════

/**
 * Update the active user count in the status panel
 * Counts this client (if they have active touches) + all remote clients with touches
 */
function updateUserCount() {
    // Count remote users with active touches + this client if they have touches
    const count = remoteTouches.size + (localTouches.size > 0 ? 1 : 0);
    userCountTXT.textContent = count;
}

// ════════════════════════════════════════
// SEND TOUCH DATA TO SERVER VIA WEBSOCKET
// ════════════════════════════════════════

/**
 * Send this client's current touch state to the server
 * Server will broadcast this to all other connected clients
 */
function sendTouchState() {
    // Only send if WebSocket is connected (readyState === 1 means OPEN)
    // This prevents errors from trying to send while disconnected
    if (socket.readyState === WebSocket.OPEN) {
        // Create a message object with all necessary data
        socket.send(JSON.stringify({
            type: "touchUpdate",                    // Message type identifier
            clientId: clientId,                      // Our unique ID
            color: myColor,                          // Our assigned color
            touches: Array.from(localTouches.values()) // Convert Map to Array for JSON
        }));
    }
}

/**
 * Tell the server to clear this client's touches on all other clients
 * Called when user lifts all fingers/releases mouse
 */
function clearTouchState() {
    // Only send if connected
    if (socket.readyState === WebSocket.OPEN) {
        // Send a clear message with just our client ID
        socket.send(JSON.stringify({
            type: "clearTouches",  // Message type identifier
            clientId: clientId      // Our unique ID
        }));
    }
}

// ══════════════════════════════════
// TOUCH EVENT HANDLERS
// ══════════════════════════════════

/**
 * Update or add a touch to our local touch map
 * @param {Touch} touch - The touch object from the event
 */
function updateLocalTouch(touch) {
    // Store touch data using the touch's unique identifier as the key
    localTouches.set(touch.identifier, {
        id: touch.identifier,  // Unique ID for this touch point
        x: touch.clientX,      // X coordinate on screen
        y: touch.clientY,      // Y coordinate on screen
        color: myColor         // Our client's color
    });
}

// Touch start - fires when a new finger touches the screen
canvas.addEventListener("touchstart", e => {
    // Loop through all new touches (multiple fingers can touch simultaneously)
    for (let t of e.changedTouches) {
        updateLocalTouch(t);
        logWithColor(`Touch start: ID ${t.identifier} at (${Math.round(t.clientX)}, ${Math.round(t.clientY)})`, myColor);
    }
    // Send updated touch state to server
    sendTouchState();
    updateUserCount();
    // Prevent default behavior (scrolling, zooming, etc.)
    e.preventDefault();
}, { passive: false }); // passive: false allows preventDefault() to work

// Touch move - fires when a finger moves across the screen
canvas.addEventListener("touchmove", e => {
    // Update all moving touches
    for (let t of e.changedTouches) {
        updateLocalTouch(t);
    }
    // Send updated positions to server
    sendTouchState();
    e.preventDefault();
}, { passive: false });

// Touch end - fires when a finger is lifted from the screen
canvas.addEventListener("touchend", e => {
    // Remove ended touches from our local map
    for (let t of e.changedTouches) {
        localTouches.delete(t.identifier);
        logWithColor(`Touch end: ID ${t.identifier}`, myColor);
    }
    // Send updated state to server
    sendTouchState();
    // If all touches are gone, tell server to clear our display on other clients
    if (localTouches.size === 0) {
        clearTouchState();
    }
    updateUserCount();
    e.preventDefault();
}, { passive: false });

// Touch cancel - fires when a touch is interrupted (e.g., system dialog)
canvas.addEventListener("touchcancel", e => {
    // Handle the same as touchend
    for (let t of e.changedTouches) {
        localTouches.delete(t.identifier);
        logWithColor(`Touch cancel: ID ${t.identifier}`, myColor);
    }
    sendTouchState();
    if (localTouches.size === 0) {
        clearTouchState();
    }
    updateUserCount();
    e.preventDefault();
}, { passive: false });

// ══════════════════════════════════
// MOUSE SUPPORT (FOR TESTING ON DESKTOP WITHOUT TOUCH SCREEN)
// ══════════════════════════════════

let mouseDown = false;          // Track if mouse button is currently pressed
const MOUSE_ID = 'mouse';       // Identifier for mouse "touch" (since mouse has no ID)

// Mouse down - treat like a touch start
canvas.addEventListener("mousedown", e => {
    mouseDown = true;
    // Add mouse position as a "touch" with special ID
    localTouches.set(MOUSE_ID, {
        id: MOUSE_ID,
        x: e.clientX,
        y: e.clientY,
        color: myColor
    });
    sendTouchState();
    updateUserCount();
    logWithColor(`Mouse down at (${Math.round(e.clientX)}, ${Math.round(e.clientY)})`, myColor);
});

// Mouse move - treat like a touch move (only if button is pressed)
canvas.addEventListener("mousemove", e => {
    if (mouseDown) {
        // Update mouse position
        localTouches.set(MOUSE_ID, {
            id: MOUSE_ID,
            x: e.clientX,
            y: e.clientY,
            color: myColor
        });
        sendTouchState();
    }
});

// Mouse up - treat like a touch end
canvas.addEventListener("mouseup", e => {
    if (mouseDown) {
        mouseDown = false;
        // Remove mouse "touch"
        localTouches.delete(MOUSE_ID);
        sendTouchState();
        if (localTouches.size === 0) {
            clearTouchState();
        }
        updateUserCount();
        logWithColor(`Mouse up`, myColor);
    }
});

// Mouse leave - if mouse leaves canvas while pressed, end the "touch"
canvas.addEventListener("mouseleave", e => {
    if (mouseDown) {
        mouseDown = false;
        localTouches.delete(MOUSE_ID);
        sendTouchState();
        if (localTouches.size === 0) {
            clearTouchState();
        }
        updateUserCount();
    }
});

// ══════════════════════════════════
// DRAWING LOOP (RENDERS ALL TOUCHES TO CANVAS)
// ══════════════════════════════════

/**
 * Main drawing function - runs continuously via requestAnimationFrame
 * Draws all local and remote touches as colored circles
 */
function draw() {
    // Clear the entire canvas (removes previous frame)
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ══════════════════════════════════
    // Draw Local Touches (this client's touches)
    // ══════════════════════════════════
    // These are drawn larger with a white border to stand out
    localTouches.forEach(t => {
        // Set fill color to this touch's color (our client color)
        ctx.fillStyle = t.color;
        ctx.beginPath();
        // Draw circle: center (x,y), radius 35, from 0 to 2π radians (full circle)
        ctx.arc(t.x, t.y, 35, 0, Math.PI * 2);
        ctx.fill();

        // Add a white border to make it stand out from remote touches
        ctx.strokeStyle = "white";
        ctx.lineWidth = 2;
        ctx.stroke();
    });

    // ══════════════════════════════════
    // DRAW LOCAL TOUCHES (THIS CLIENT'S TOUCHES)
    // ══════════════════════════════════
    // These are drawn smaller with a subtle border
    remoteTouches.forEach((clientData, clientId) => {
        // Each client can have multiple touches, so loop through their touch array
        clientData.touches.forEach(t => {
            // Use the remote client's color, or cyan as fallback
            ctx.fillStyle = clientData.color || "cyan";
            ctx.beginPath();
            // Draw smaller circle (radius 25 vs 35 for local)
            ctx.arc(t.x, t.y, 25, 0, Math.PI * 2);
            ctx.fill();

            // Add a subtle semi-transparent white border
            ctx.strokeStyle = "rgba(255,255,255,0.3)";
            ctx.lineWidth = 1;
            ctx.stroke();
        });
    });

    // Schedule next frame - creates smooth 60fps animation loop
    requestAnimationFrame(draw);
}

// ══════════════════════════════════
// GO GO GADGET: START EVERYTHING
// ══════════════════════════════════
// Begin the drawing loop
draw();

// Log that client is initialized and ready
logWithColor(`Client initialized with ID: ${clientId}`, myColor);
