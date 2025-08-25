require('dotenv').config();

async function testSimpleGeminiRequest() {
    const geminiApiKey = process.env.GEMINI_API_KEY;
    
    if (!geminiApiKey) {
        console.error('Please set GEMINI_API_KEY in .env file');
        return;
    }

    console.log('Testing simple Gemini API request...');
    
    try {
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${geminiApiKey}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                contents: [{
                    parts: [{
                        text: 'Hello! Just testing the API connection. Please respond with "Gemini API test successful".'
                    }]
                }]
            })
        });
        
        console.log('Response status:', response.status, response.statusText);
        
        if (!response.ok) {
            const errorText = await response.text();
            console.error('Error response:', errorText);
            return;
        }
        
        const result = await response.json();
        console.log('Success! Gemini responded:', result.candidates[0].content.parts[0].text);
        
    } catch (error) {
        console.error('Request failed:', error);
    }
}

testSimpleGeminiRequest();
