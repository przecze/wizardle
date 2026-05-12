.PHONY: deploy reqs update_reqs py_audit py_audit_fix npm_audit npm_audit_fix

PYTHON_VERSION := 3.14
UV_VERSION     := 0.11.14
NODE_VERSION   := 22

# ── Deploy ────────────────────────────────────────────────────────────────────

deploy:
	cd ansible && ansible-playbook deploy.yml

# ── Python / backend ──────────────────────────────────────────────────────────

reqs:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip compile requirements.in --output-file requirements.txt"

update_reqs:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip compile requirements.in --upgrade --output-file requirements.txt"

py_audit:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip install --system pip-audit && pip-audit -r requirements.txt"

py_audit_fix:
	docker run --rm -v "$(PWD)/backend:/app" -w /app python:$(PYTHON_VERSION)-slim \
		bash -c "pip install -q uv==$(UV_VERSION) && uv pip install --system pip-audit && pip-audit -r requirements.txt --fix && uv pip compile requirements.in --upgrade --output-file requirements.txt"

# ── npm / frontend ────────────────────────────────────────────────────────────

npm_audit:
	docker run --rm -v "$(PWD)/frontend:/app" -w /app node:$(NODE_VERSION)-slim npm audit

npm_audit_fix:
	docker run --rm -v "$(PWD)/frontend:/app" -w /app node:$(NODE_VERSION)-slim npm audit fix
