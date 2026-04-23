IMAGES := capabilities cve-2021-3156 cve-2023-22809 cve-2025-32463 cve-2025-59825 cve-2025-66478 cve-2026-24061 lecture sudo suid web
PLATFORM ?= linux/amd64
VERSION ?=
PUSH ?= 0
OUTPUT := $(if $(filter 1 true yes,$(PUSH)),--push,--load)

.DEFAULT_GOAL := all
.PHONY: all $(IMAGES)

all: $(IMAGES)

$(IMAGES):
	rm -f "$@/bash.bashrc"
	cp bash.bashrc "$@/"
	trap 'rm -f "$@/bash.bashrc"' EXIT INT TERM; \
	docker buildx build --platform "$(PLATFORM)" -t "$(if $(USERNAME),$(USERNAME)/,)$@$(if $(VERSION),:$(VERSION),)" $(OUTPUT) "$@"
