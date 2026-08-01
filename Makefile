.PHONY: deploy reqs update_reqs py_audit py_audit_fix npm_audit npm_audit_fix chapters

PYTHON_VERSION := 3.14.6
UV_VERSION     := 0.11.14
NODE_VERSION   := 24.18

# ── Deploy ────────────────────────────────────────────────────────────────────

deploy:
	cd ansible && ansible-playbook deploy.yml

# ── Preprocessing ─────────────────────────────────────────────────────────────

chapters:
	docker run --rm -v "$(PWD):/app" -w /app python:$(PYTHON_VERSION)-slim \
		python3 preprocessing/build_chapters.py

# ── Python / backend ──────────────────────────────────────────────────────────

reqs:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip compile requirements.in --exclude-newer '7 days' --output-file requirements.txt"

py_audit:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip install --system pip-audit && pip-audit -r requirements.txt"

py_audit_fix:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip install --system pip-audit && pip-audit -r requirements.txt --fix && uv pip compile requirements.in --upgrade --exclude-newer '7 days' --output-file requirements.txt"

# ── npm / frontend ────────────────────────────────────────────────────────────

npm_audit:
	docker run --rm -v "$(PWD)/frontend:/app" -w /app node:$(NODE_VERSION)-slim npm audit

npm_audit_fix:
	docker run --rm -v "$(PWD)/frontend:/app" -w /app node:$(NODE_VERSION)-slim npm audit fix --min-release-age 7
