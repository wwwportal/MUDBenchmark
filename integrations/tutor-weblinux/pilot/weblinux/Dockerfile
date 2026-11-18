FROM debian:trixie-slim@sha256:a72b4433de1cf7d6bae0c4cee74d0547f58601a643b3375f070c51600d63b6b2

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash ca-certificates g++ gdb git neovim python3 \
    && rm -rf /var/lib/apt/lists/*

ARG SYNVIM_REV=0b4364e872f4ee5674478398e48b3b562eae7e60
COPY pilot/weblinux/plugins.lock.json /tmp/plugins.lock.json
RUN git init /tmp/synvim && git -C /tmp/synvim fetch --depth 1 \
    https://github.com/Syntra-Tutor/synvim.git "$SYNVIM_REV" && \
    git -C /tmp/synvim checkout --detach FETCH_HEAD && \
    mkdir -p /root/.config && cp -a /tmp/synvim/nvim /root/.config/nvim && \
    cp /tmp/plugins.lock.json /root/.config/nvim/lazy-lock.json && \
    grep -q '"Syntra-Labs/scribe",' /root/.config/nvim/lua/plugins.lua && \
    sed -i '/"Syntra-Labs\/scribe",/a\    enabled = false,' /root/.config/nvim/lua/plugins.lua && \
    install -d /root/.local/share/nvim/lazy && \
    git init /root/.local/share/nvim/lazy/lazy.nvim && \
    git -C /root/.local/share/nvim/lazy/lazy.nvim remote add origin \
    https://github.com/folke/lazy.nvim.git && \
    git -C /root/.local/share/nvim/lazy/lazy.nvim fetch --depth 1 \
    https://github.com/folke/lazy.nvim.git 306a05526ada86a7b30af95c5cc81ffba93fef97 && \
    git -C /root/.local/share/nvim/lazy/lazy.nvim checkout -B stable FETCH_HEAD && \
    timeout 120 nvim --headless '+Lazy! restore' +qa && \
    python3 -m json.tool /root/.config/nvim/lazy-lock.json >/dev/null && \
    test -f /root/.local/share/nvim/lazy/lualine.nvim/lua/lualine.lua && \
    rm -rf /tmp/synvim /root/.cache/nvim

COPY tutor /opt/tutor/tutor
COPY tutor.py /opt/tutor/tutor.py
COPY problems/000a-hello-world /opt/tutor/problems/000a-hello-world
COPY pilot/weblinux/prelude.hpp /opt/tutor/pilot/prelude.hpp
RUN mkdir /opt/tutor/pilot/prelude.hpp.gch && \
    g++ -O3 -std=c++20 -Wall -Wextra -x c++-header \
    /opt/tutor/pilot/prelude.hpp -o /opt/tutor/pilot/prelude.hpp.gch/release && \
    g++ -g -O0 -std=c++20 -Wall -Wextra -x c++-header \
    /opt/tutor/pilot/prelude.hpp -o /opt/tutor/pilot/prelude.hpp.gch/debug && \
    sed -i '1i#include "/opt/tutor/pilot/prelude.hpp"' \
    /opt/tutor/problems/000a-hello-world/cpp/harness.cpp
COPY pilot/weblinux/guest-init /init
COPY pilot/weblinux/tutor-debug /usr/local/bin/tutor-debug
COPY pilot/weblinux/tutor-save /usr/local/bin/tutor-save
COPY pilot/weblinux/tutor-restore /usr/local/bin/tutor-restore
RUN chmod 755 /init /usr/local/bin/tutor-debug /usr/local/bin/tutor-save \
    /usr/local/bin/tutor-restore /opt/tutor/tutor.py && \
    ln -s /opt/tutor/tutor.py /usr/local/bin/tutor && \
    /opt/tutor/tutor.py list
