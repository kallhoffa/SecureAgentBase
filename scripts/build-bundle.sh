#!/bin/bash
set -e

# Build kimaki bundle
docker run --rm \
  -v $(pwd)/bundle:/output \
  debian:stable bash -c '
    set -e
    apt-get update
    apt-get install -y curl gnupg
    NODE_VERSION="20.18.0"
    NODE_TARBALL="node-v${NODE_VERSION}-linux-x64.tar.gz"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/${NODE_TARBALL}" -o "/tmp/${NODE_TARBALL}"
    curl -fsSL "https://nodejs.org/dist/v${NODE_VERSION}/SHASUMS256.txt" -o /tmp/SHASUMS256.txt
    (cd /tmp && sha256sum -c SHASUMS256.txt --ignore-missing --status) || { echo "Node.js checksum verification failed"; exit 1; }
    tar -xzf "/tmp/${NODE_TARBALL}" -C /usr/local --strip-components=1
    npm install -g kimaki@latest
    cp -r $(npm root -g)/kimaki /output/kimaki/
    chmod +x /output/kimaki/bin.js 2>/dev/null || true
    mkdir -p /output/kimaki/bin
    echo "#!/bin/bash" > /output/kimaki/bin/kimaki
    echo "exec node /opt/kimaki/bin.js \"\$@\"" >> /output/kimaki/bin/kimaki
    chmod +x /output/kimaki/bin/kimaki
  '

# Create tarball
tar -czvf debian-packages.tar.gz bundle/
