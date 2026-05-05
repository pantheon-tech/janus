#!/usr/bin/env bash
# Create a .gitmodules file pointing to a non-existent submodule.
# We don't need a real submodule clone — analyzer only checks for the file's presence.
cat > .gitmodules <<'EOF'
[submodule "vendor/lib"]
    path = vendor/lib
    url = https://example.invalid/vendor/lib.git
EOF
git add .gitmodules
git -c user.name=fixture -c user.email=f@x.com commit -q -m "fixture: add gitmodules"
