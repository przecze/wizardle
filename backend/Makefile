.PHONY: reqs

# Variables
PYTHON_VERSION := 3.14
UV_VERSION := 0.9.28

reqs:
	@echo "Generating requirements.txt from requirements.in..."
	docker run --rm \
		-v "$(PWD):/app" \
		-w /app \
		python:$(PYTHON_VERSION)-slim \
		bash -c "pip install uv==$(UV_VERSION) && uv pip compile requirements.in --output-file requirements.txt"
	@echo "Done."
