IMAGES := capabilities cve-2021-3156 cve-2023-22809 cve-2025-32463 cve-2025-55182 cve-2025-59825 cve-2026-24061 lecture sudo suid web
PLATFORM ?= linux/amd64
VERSION ?=
PUSH ?= 0
REPOSITORY := $(if $(USERNAME),$(USERNAME)/,)$(IMAGENAME)
OUTPUT := $(if $(filter 1 true yes,$(PUSH)),--push,--load)
VERSION_SUFFIX := $(if $(VERSION),-$(VERSION),)

.DEFAULT_GOAL := all
.PHONY: all check-env $(IMAGES)

all: $(IMAGES)

check-env:
	@test -n "$(IMAGENAME)" || { echo "IMAGENAME is required"; exit 1; }

$(IMAGES): check-env
	rm -f "$@/bash.bashrc"
	cp bash.bashrc "$@/"
	trap 'rm -f "$@/bash.bashrc"' EXIT INT TERM; \
	docker buildx build --platform "$(PLATFORM)" -t "$(REPOSITORY):$@$(VERSION_SUFFIX)" $(OUTPUT) "$@"
