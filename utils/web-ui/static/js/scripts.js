function sendMessage(mode) {
    const message = document.getElementById('message-input').value;
    fetch(`/api/${mode}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message })
    })
    .then(response => response.json())
    .then(data => {
        const chatBox = document.getElementById('chat-box');
        chatBox.innerHTML += `<p><strong>你:</strong> ${message}</p>`;
        chatBox.innerHTML += `<p><strong>AI:</strong> ${data.response}</p>`;
    });
}