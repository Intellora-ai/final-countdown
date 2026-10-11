"""Install one hash-pinned official Linux CI binary, preserving TLS verification."""
import hashlib
import io
import tarfile
import urllib.request
from pathlib import Path

VERSION = '1.7.12'
SHA256 = '8aca8db96f1b94770f1b0d72b6dddcb1ebb8123cb3712530b08cc387b349a3d8'
URL = f'https://github.com/rhysd/actionlint/releases/download/v{VERSION}/actionlint_{VERSION}_linux_amd64.tar.gz'

if __name__ == '__main__':
    with urllib.request.urlopen(URL, timeout=30) as response:
        data = response.read(20_000_001)
    if len(data) > 20_000_000 or hashlib.sha256(data).hexdigest() != SHA256:
        raise ValueError('Workflow validator checksum mismatch.')
    # Extract only the known binary; never unpack arbitrary archive paths.
    with tarfile.open(fileobj=io.BytesIO(data), mode='r:gz') as archive:
        member = archive.getmember('actionlint')
        if not member.isfile():
            raise ValueError('Expected a regular binary.')
        binary = archive.extractfile(member)
        assert binary is not None
        target = Path('.ci-tools/actionlint')
        target.parent.mkdir(exist_ok=True)
        target.write_bytes(binary.read())
        target.chmod(0o755)
