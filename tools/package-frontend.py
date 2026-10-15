"""Package only public, static frontend files; never env/backend/user data."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED

root = Path(__file__).resolve().parents[1]
output = root / 'artifacts' / 'spendly-web-redesign.zip'
files = [root / name for name in ['index.html', 'offline.html', 'manifest.webmanifest', 'sw.js', 'README.md']]
files += sorted(path for path in (root / 'assets').rglob('*') if path.is_file())
files += sorted((root / 'docs').glob('*.md'))
assert all(path.is_file() and path.resolve().is_relative_to(root) for path in files)
assert not any(path.name.startswith('.env') for path in files)
output.parent.mkdir(exist_ok=True)
with ZipFile(output, 'w', ZIP_DEFLATED) as archive:
    for path in files:
        archive.write(path, path.relative_to(root).as_posix())
with ZipFile(output) as archive:
    assert archive.testzip() is None
print(f'{output.name}: {len(files)} public files, {output.stat().st_size} bytes; archive verified.')
