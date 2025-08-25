const express = require('express');
const path = require('path');

const app = express();
const PORT = 3000;

// Serve static files from sketches directory
app.use('/sketches', express.static('sketches'));
app.use('/sessions', express.static('sessions'));
app.use('/p5', express.static('node_modules/p5/lib'));

// Basic route
app.get('/', (req, res) => {
    res.send(`
        <h1>Agentic Artist - Local Testing</h1>
        <p>Server is running!</p>
        <p><a href="/sketches/test-sketch.html">View Test Sketch</a></p>
    `);
});

app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Test sketch: http://localhost:${PORT}/sketches/test-sketch.html`);
});
