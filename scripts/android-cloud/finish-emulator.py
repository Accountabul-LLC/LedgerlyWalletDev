import pathlib, subprocess, time
adb = '/workspace/android-sdk/platform-tools/adb'
def run(*args, timeout=30):
    return subprocess.run([adb, *args], capture_output=True, timeout=timeout)
started = time.monotonic()
while time.monotonic() - started < 420:
    try:
        boot = run('shell', 'getprop', 'sys.boot_completed', timeout=10)
        if boot.stdout.strip() == b'1':
            print('Android boot complete.', flush=True)
            break
    except subprocess.TimeoutExpired:
        pass
    time.sleep(5)
else:
    print('Android did not complete boot in the bounded window.', flush=True)
    raise SystemExit(1)
for args in [('root',), ('wait-for-device',)]:
    result = run(*args)
    print(args[0], 'exit', result.returncode, flush=True)
run('shell', 'mkdir', '-p', '/data/local/tmp/ledgerly-system-cas')
run('shell', 'cp', '-a', '/system/etc/security/cacerts/.', '/data/local/tmp/ledgerly-system-cas/')
# Bind a disposable overlay over the CA directory. Keep the system image and
# verity settings intact and retain every original platform trust anchor.
overlay = run('shell', 'mount', '--bind', '/data/local/tmp/ledgerly-system-cas', '/system/etc/security/cacerts')
if overlay.returncode:
    print('CA overlay mount failed.', flush=True)
    raise SystemExit(1)
for cert in pathlib.Path('/usr/local/share/ca-certificates').glob('*.crt'):
    digest = subprocess.check_output(['openssl', 'x509', '-in', str(cert), '-subject_hash_old', '-noout'], text=True).strip()
    dest = '/workspace/android-setup/' + digest + '.0'
    subprocess.run(['openssl', 'x509', '-in', str(cert), '-outform', 'PEM', '-out', dest], check=True)
    result = run('push', dest, '/system/etc/security/cacerts/' + digest + '.0')
    if result.returncode:
        print('CA trust installation failed.', flush=True)
        raise SystemExit(1)
    run('shell', 'chmod', '644', '/system/etc/security/cacerts/' + digest + '.0')
run('shell', 'chcon', '-R', 'u:object_r:system_file:s0', '/data/local/tmp/ledgerly-system-cas')
print('Cloud proxy CA trust installed in disposable emulator.', flush=True)
run('shell', 'settings', 'put', 'global', 'http_proxy', '10.0.2.2:8788')
run('shell', 'settings', 'put', 'system', 'screen_off_timeout', '1800000')
run('reverse', 'tcp:8083', 'tcp:8083')
installed = run('install', '--no-streaming', '/workspace/android-setup/Expo-Go.apk', timeout=300)
print('Expo Go install exit', installed.returncode, installed.stdout.decode(), installed.stderr.decode(), flush=True)
if installed.returncode:
    raise SystemExit(1)
launch = run('shell', 'am', 'start', '-W', '-a', 'android.intent.action.VIEW', '-d', 'exp://127.0.0.1:8083', '-p', 'host.exp.exponent', timeout=60)
print(launch.stdout.decode(), flush=True)
