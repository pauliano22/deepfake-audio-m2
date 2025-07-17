# hf_api_client.py - HuggingFace API client for mobile app
import requests
import json
import time
from typing import Dict, Any

class HuggingFaceDeepfakeAPI:
    """HuggingFace API client for deepfake detection"""
    
    def __init__(self, model_url: str = "https://pauliano22-deepfake-audio-detector.hf.space"):
        self.base_url = model_url
        self.api_url = f"{self.base_url}/gradio_api"
    
    def upload_audio_file(self, audio_file_path: str) -> str:
        """Upload audio file to Gradio and return file path"""
        with open(audio_file_path, 'rb') as f:
            files = {'files': f}
            response = requests.post(f"{self.api_url}/upload", files=files)
            response.raise_for_status()
            return response.json()[0]
    
    def upload_audio_bytes(self, audio_bytes: bytes, filename: str = "audio.wav") -> str:
        """Upload audio bytes to Gradio and return file path"""
        files = {'files': (filename, audio_bytes, 'audio/wav')}
        response = requests.post(f"{self.api_url}/upload", files=files)
        response.raise_for_status()
        return response.json()[0]
    
    def predict_audio(self, file_path: str) -> Dict[str, Any]:
        """Make prediction request and return event ID"""
        data = {
            "data": [{
                "path": file_path,
                "meta": {"_type": "gradio.FileData"}
            }]
        }
        response = requests.post(f"{self.api_url}/call/predict", json=data)
        response.raise_for_status()
        return response.json()
    
    def poll_results(self, event_id: str, max_attempts: int = 30) -> str:
        """Poll for results using event ID"""
        url = f"{self.api_url}/call/predict/{event_id}"
        
        for attempt in range(max_attempts):
            try:
                response = requests.get(url, stream=True)
                response.raise_for_status()
                
                for line in response.iter_lines():
                    if line.startswith(b'data: '):
                        try:
                            data = json.loads(line[6:])
                            
                            # Handle different response formats
                            if isinstance(data, list) and len(data) > 0:
                                return data[0]
                            
                            if isinstance(data, dict):
                                if data.get('msg') == 'process_completed' and data.get('output'):
                                    return data['output']['data'][0]
                                if data.get('data'):
                                    return data['data'][0]
                                    
                        except (json.JSONDecodeError, KeyError, IndexError):
                            continue
                            
            except requests.RequestException:
                pass
                
            time.sleep(1)
        
        raise TimeoutError("Failed to get results after polling")
    
    def detect_deepfake(self, audio_file_path: str) -> Dict[str, Any]:
        """Complete deepfake detection pipeline"""
        try:
            # Upload file
            file_path = self.upload_audio_file(audio_file_path)
            
            # Make prediction
            prediction_result = self.predict_audio(file_path)
            event_id = prediction_result['event_id']
            
            # Poll for results
            raw_result = self.poll_results(event_id)
            
            # Parse results
            return self.parse_result(raw_result)
            
        except Exception as e:
            return {
                'error': str(e),
                'prediction': 'ERROR',
                'confidence': 0.0,
                'probabilities': {'real': 0.5, 'fake': 0.5}
            }
    
    def parse_result(self, markdown_result: str) -> Dict[str, Any]:
        """Parse markdown result into structured data"""
        try:
            # Extract percentages
            import re
            
            real_match = re.search(r'Real Voice.*?(\d+\.\d+)%', markdown_result, re.IGNORECASE)
            fake_match = re.search(r'AI Generated.*?(\d+\.\d+)%', markdown_result, re.IGNORECASE)
            
            real_prob = float(real_match.group(1)) / 100 if real_match else 0.5
            fake_prob = float(fake_match.group(1)) / 100 if fake_match else 0.5
            
            # Determine prediction
            is_fake = fake_prob > real_prob or 'AI GENERATED' in markdown_result.upper()
            
            return {
                'prediction': 'FAKE' if is_fake else 'REAL',
                'confidence': max(real_prob, fake_prob),
                'probabilities': {'real': real_prob, 'fake': fake_prob},
                'is_suspicious': fake_prob > 0.6,
                'raw_result': markdown_result
            }
            
        except Exception as e:
            # Fallback parsing
            is_fake = 'ai generated' in markdown_result.lower()
            return {
                'prediction': 'FAKE' if is_fake else 'REAL',
                'confidence': 0.7,
                'probabilities': {'real': 0.3 if is_fake else 0.7, 'fake': 0.7 if is_fake else 0.3},
                'is_suspicious': is_fake,
                'raw_result': markdown_result,
                'parse_error': str(e)
            }