"use babel";

let PreviewBlock;
const $ = require("jquery");

export default {
    config: {
        showDelay: {
            description: "Delay (in milliseconds) before showing",
            type: "integer",
            default: 100,
            minimum: 100
        },
        limitLines: {
            description: "Maximum number of lines to show (0 to show all)",
            type: "integer",
            default: 0,
            minimum: 0
        },
        autoAlign: {
            description: "Show above the cursor if there is too much code",
            type: "boolean",
            default: false
        }
    },
    hoverTimeout: undefined,
    leaveTimeout: undefined,
    previewBlockElement: undefined,

    get showDelay() {
        return atom.config.get("folded-code-preview.showDelay");
    },
    get limitLines() {
        return atom.config.get("folded-code-preview.limitLines");
    },
    get autoAlign() {
        return atom.config.get("folded-code-preview.autoAlign");
    },

    initialize() {
        atom.packages.onDidActivateInitialPackages(() => this.initializeHooks());
    },

    initializeHooks() {
        $("body").on("mouseenter", ".fold-marker", e => {
            this.disposeElement();

            const $e = $(e.target);
            const editor = atom.workspace.getActiveTextEditor();
            const lineHeight = parseFloat(window.getComputedStyle(editor.element).getPropertyValue("line-height"));
            const gutterWidth = $(".gutter-container", editor.element).outerWidth();
			const scrollViewWidth = Math.round(parseInt($('.scroll-view > div > .lines', editor.element).css('width')));
			const wrapGuideWidth = Math.round($('.wrap-guide', editor.element).position().left);

            const data = {
                y: $e.offset().top - $e.outerHeight() - ($e.outerHeight() - 10),
                w: Math.min(scrollViewWidth + gutterWidth, wrapGuideWidth + gutterWidth),
                gutterWidth: gutterWidth,
                screenRow: editor.bufferRowForScreenRow(parseInt($e.parents('.line').attr("data-screen-row")))
            };

            if (this.showDelay >= 100)
				this.hoverTimeout = setTimeout(() => this.hoverFoldBlock(data), this.showDelay);
            else this.hoverFoldBlock(data);
        });

        $("body").on("mouseleave mousedown mouseup", ".fold-marker", () => {
            this.disposeHoverTimeout();
            this.disposeLeaveTimeout();

            const $e = $(".folded-code-preview");

            if ($e.css("opacity") > 0.25)
                $e.css("animation", "animateOut ease-in-out 0.5s forwards");

            this.leaveTimeout = setTimeout(() => this.disposeElement(), 500);
        });
    },

    disposeElement() {
        this.disposeHoverTimeout();
        this.disposeLeaveTimeout();

        if (typeof this.previewBlockElement !== "undefined") {
            this.previewBlockElement.destroy();
            delete this.previewBlockElement;
            this.previewBlockElement = undefined;
        }
    },

    hoverFoldBlock(data) {
        this.disposeElement();

        if (typeof PreviewBlock === "undefined")
            PreviewBlock = require("./preview-block.js");

        this.previewBlockElement = new PreviewBlock({
            autoAlign: this.autoAlign,
            limitLines: this.limitLines,
            data: data
        });

        atom.workspace
            .getActiveTextEditor()
            .element.appendChild(this.previewBlockElement.element);
    },

    disposeHoverTimeout() {
        if (typeof this.hoverTimeout === "undefined") return;

        clearTimeout(this.hoverTimeout);
        delete this.hoverTimeout;
        this.hoverTimeout = undefined;
    },

    disposeLeaveTimeout() {
        if (typeof this.leaveTimeout === "undefined") return;

        clearTimeout(this.leaveTimeout);
        delete this.leaveTimeout;
        this.leaveTimeout = undefined;
    }
};
