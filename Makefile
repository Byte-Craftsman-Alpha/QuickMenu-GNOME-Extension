# Makefile for Quick Menu & ADB Manager GNOME Shell Extension
UUID = quick-menu@byte-craftsman-alpha
EXTENSION_DIR = $(HOME)/.local/share/gnome-shell/extensions/$(UUID)
ZIP_FILE = $(UUID).shell-extension.zip

SOURCES = extension.js prefs.js metadata.json
SCHEMA_DIR = schemas
SCHEMA_FILE = $(SCHEMA_DIR)/org.gnome.shell.extensions.quick-menu.gschema.xml
COMPILED_SCHEMA = $(SCHEMA_DIR)/gschemas.compiled

.PHONY: all schemas pack install uninstall clean lint

all: schemas

schemas: $(COMPILED_SCHEMA)

$(COMPILED_SCHEMA): $(SCHEMA_FILE)
	@echo "Compiling GSettings schemas..."
	glib-compile-schemas $(SCHEMA_DIR)

pack: schemas
	@echo "Packing extension zip package..."
	gnome-extensions pack \
		--extra-source=$(SCHEMA_DIR) \
		--force

lint:
	@echo "Validating syntax..."
	node --input-type=module -c < extension.js
	node --input-type=module -c < prefs.js
	@echo "All JS files valid."

install: schemas
	@echo "Installing to $(EXTENSION_DIR)..."
	mkdir -p $(EXTENSION_DIR)
	cp -r $(SOURCES) $(SCHEMA_DIR) $(EXTENSION_DIR)/
	@echo "Extension files copied. Please restart GNOME Shell or re-enable via:"
	@echo "gnome-extensions disable $(UUID) && gnome-extensions enable $(UUID)"

uninstall:
	@echo "Uninstalling $(UUID)..."
	gnome-extensions disable $(UUID) || true
	rm -rf $(EXTENSION_DIR)

clean:
	@echo "Cleaning artifacts..."
	rm -f $(ZIP_FILE)
	rm -f $(COMPILED_SCHEMA)
