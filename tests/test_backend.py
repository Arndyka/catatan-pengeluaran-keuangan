import os
import sys
import unittest
import tempfile
import subprocess
from pathlib import Path
from unittest.mock import patch, MagicMock
from types import SimpleNamespace

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'backend_nvidia'))
from fastapi.testclient import TestClient
import main

class BackendTests(unittest.TestCase):
    def test_provider_timeout_is_bounded_below_frontend_deadline(self):
        with patch.dict(os.environ, {'NVIDIA_API_KEY':'test-only'}), patch.object(main, 'OpenAI') as provider:
            main.get_client()
        self.assertEqual(provider.call_args.kwargs['timeout'],90)
        self.assertEqual(provider.call_args.kwargs['max_retries'],0)

    def test_nemotron_normalization_uses_its_supported_thinking_switch(self):
        provider = MagicMock()
        provider.chat.completions.create.return_value = SimpleNamespace(choices=[SimpleNamespace(message=SimpleNamespace(content='{"updates":[]}'))])
        with patch.object(main, 'NVIDIA_TEXT_MODEL', 'nvidia/nemotron-3.5-lightning-30b-a3b'), patch.object(main, 'get_client', return_value=provider), TestClient(main.app) as client:
            response = client.post('/api/nvidia/normalize-statement',json={'candidates':[{'index':0,'description':'Pembelian contoh','amount':10000}]})
        self.assertEqual(response.status_code,200)
        arguments = provider.chat.completions.create.call_args.kwargs
        self.assertEqual(arguments['extra_body']['chat_template_kwargs'], {'enable_thinking':False})
        self.assertFalse(arguments['stream'])

    def test_vision_filter_excludes_noise_unpaid_and_invalid_facts(self):
        good = {'record_kind':'transaction','status':'posted','date':'2026-10-15','amount':10000,'direction':'incoming'}
        rows = [good, {**good,'record_kind':'advertisement'}, {**good,'status':'pending'}, {**good,'date':'2026-02-30'}, {**good,'amount':True}]
        result = main.filter_vision_result({'bank':'krom','transactions':rows})
        self.assertEqual(result['transactions'], [good])
        self.assertEqual(result['excluded_count'], 4)

    def test_vision_requires_valid_image_and_configured_key(self):
        with patch.dict(os.environ, {'NVIDIA_API_KEY':''}), TestClient(main.app) as client:
            self.assertEqual(client.post('/api/nvidia/read-page', json={'image_data_url':'https://example.com/photo.png'}).status_code,400)
            self.assertEqual(client.post('/api/nvidia/read-page', json={'image_data_url':'data:image/png;base64,'+'A'*9_000_001}).status_code,413)
            self.assertEqual(client.post('/api/nvidia/read-page', json={'image_data_url':'data:image/png;base64,AAAA'}).status_code,503)

    def test_health_and_local_preview_cors(self):
        with TestClient(main.app) as client:
            self.assertEqual(client.get('/health').status_code, 200)
            response = client.options('/api/nvidia/normalize-statement', headers={'Origin':'http://127.0.0.1:4173','Access-Control-Request-Method':'POST','Access-Control-Request-Headers':'content-type'})
            self.assertEqual(response.status_code, 200)
            self.assertEqual(response.headers['access-control-allow-origin'], 'http://127.0.0.1:4173')

    def test_missing_key_fails_locally_without_api_call(self):
        with patch.dict(os.environ, {'NVIDIA_API_KEY':''}), TestClient(main.app) as client:
            response = client.post('/api/nvidia/normalize-statement',json={'candidates':[{'index':0}]})
            self.assertEqual(response.status_code,503)

    def test_ai_updates_cannot_change_original_numeric_fields(self):
        updates = main.validate_updates([{'index':0,'amount':999,'date':'1900-01-01','type':'transfer','sourceAccountId':'unknown','destinationAccountId':'bca'}], [{'index':0}], [{'id':'bca'}])
        self.assertEqual(updates,[{'index':0,'type':'transfer','destinationAccountId':'bca'}])

    def test_dotenv_is_loaded_relative_to_backend_not_working_directory(self):
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            (root/'main.py').write_text((ROOT/'backend_nvidia/main.py').read_text(encoding='utf-8'),encoding='utf-8')
            (root/'.env').write_text('NVIDIA_API_KEY=test-only-not-a-real-key\n',encoding='utf-8')
            env = dict(os.environ)
            env.pop('NVIDIA_API_KEY',None)
            result = subprocess.run([sys.executable,'-c',"import runpy,sys; ns=runpy.run_path(sys.argv[1]); assert ns['health']()['api_key_configured']", str(root/'main.py')], cwd=ROOT,env=env,capture_output=True,text=True)
            self.assertEqual(result.returncode,0,result.stderr)

if __name__=='__main__': unittest.main()
