import math, wave, struct, base64

sample_rate = 44100
duration = 0.3
num_samples = int(duration * sample_rate)

import random

with wave.open('better_pop.wav', 'w') as w:
    w.setnchannels(1)
    w.setsampwidth(2)
    w.setframerate(sample_rate)
    
    for i in range(num_samples):
        t = float(i) / sample_rate
        # Very sharp attack, rapid decay
        decay = math.exp(-t * 25)
        # Deep frequency sweep for "thud" body
        freq = 600 * math.exp(-t * 30) + 100
        val = math.sin(2 * math.pi * freq * t) * decay
        
        # Add high-frequency noise for the "snap/crack"
        noise_decay = math.exp(-t * 60)
        noise = (random.random() - 0.5) * 2.0 * noise_decay
        
        # Combine
        sample = (val * 0.7 + noise * 0.5) * 32767
        sample = max(min(sample, 32767), -32768)
        w.writeframes(struct.pack('h', int(sample)))

with open('better_pop.wav', 'rb') as f:
    b64 = base64.b64encode(f.read()).decode('utf-8')
    
import re
with open('public/client.js', 'r') as f:
    content = f.read()

# Replace the old popAudio source
content = re.sub(r'const popAudio = new Audio\("data:audio/wav;base64,.*?"\);', f'const popAudio = new Audio("data:audio/wav;base64,{b64}");', content)

with open('public/client.js', 'w') as f:
    f.write(content)

print("Sound updated!")
