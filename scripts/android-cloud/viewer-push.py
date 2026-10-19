import io, json, pathlib, re, subprocess, sys, time, urllib.request, termios
from PIL import Image, ImageDraw

# Read the hosted viewer credential only from the hidden terminal input.
mode = termios.tcgetattr(0)
mode[3] &= ~termios.ECHO
termios.tcsetattr(0, termios.TCSANOW, mode)
print('Ready for viewer credential JSON', flush=True)
config = json.loads(sys.stdin.readline())
adb = '/workspace/android-sdk/platform-tools/adb'
pause = pathlib.Path('/workspace/android-setup/viewer-paused')
public = pathlib.Path('/workspace/android-setup/viewer-public')
def hidden_frame():
    im = Image.new('RGB', (540, 960), '#171a18')
    ImageDraw.Draw(im).text((60, 450), 'Private wallet step - screen hidden', fill='white')
    out = io.BytesIO()
    im.save(out, format='PNG')
    return out.getvalue()

def call(*args):
    return subprocess.run([adb, '-s', 'emulator-5554', *args], capture_output=True, timeout=30, check=True).stdout

while True:
    try:
        # This read-only viewer is enabled only after explicitly inspecting a
        # public screen. Pause before every navigation or form interaction, and
        # keep it paused throughout wallet setup/unlock/recovery. Avoid spawning
        # UiAutomation repeatedly: it interferes with Android accessibility QA.
        if pause.exists() or not public.exists():
            frame = hidden_frame()
        else:
            frame = call('exec-out', 'screencap', '-p')
        request = urllib.request.Request(config['url'] + '/api/frame', data=frame,
            headers={'Content-Type': 'image/png', 'OAI-Sites-Authorization': 'Bearer ' + config['token']}, method='POST')
        with urllib.request.urlopen(request, timeout=30) as response:
            response.read()
            print('Frame delivered', flush=True)
    except Exception as error:
        print('Viewer retry:', type(error).__name__, flush=True)
    time.sleep(5)
