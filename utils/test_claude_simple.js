require('dotenv').config();

async function testSimpleClaudeRequest() {
    const claudeApiKey = process.env.CLAUDE_API_KEY;
    
    if (!claudeApiKey) {
        console.error('Please set CLAUDE_API_KEY in .env file');
        return;
    }

    console.log('Testing simple Claude API request...');
    
    try {
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': claudeApiKey,
                'Content-Type': 'application/json',
                'anthropic-version': '2023-06-01'
            },
            body: JSON.stringify({
                model: 'claude-3-5-sonnet-20241022',
                max_tokens: 100,
                messages: [{
                    role: 'user',
                    content: 'Hello! Just testing the API connection. Please respond with "API test successful".'
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
        console.log('Success! Claude responded:', result.content[0].text);
        
    } catch (error) {
        console.error('Request failed:', error);
    }
}

testSimpleClaudeRequest();
