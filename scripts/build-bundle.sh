#!/bin/bash
set -e

# Build kimaki bundle
docker run --rm \
  -v $(pwd)/bundle:/output \
  debian:stable bash -c '
    set -e
    apt-get update
    apt-get install -y curl gnupg
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
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
