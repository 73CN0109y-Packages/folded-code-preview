"use babel";
/** @jsx etch.dom */

// Lazy load jQuery and lodash
let $, _;
import etch from "etch";

export default class PreviewBlock {
	constructor(props) {
		this.props = props;

		etch.initialize(this);
	}

	get preferredLineLength() {
		return atom.config.get("editor.preferredLineLength");
	}

	get tabLength() {
		return atom.config.get("editor.tabLength");
	}

	get softWrapHangingIndent() {
		return atom.config.get("editor.softWrapHangingIndent");
	}

	render() {
		if (typeof $ === "undefined")
			$ = require("jquery");

		const editor = atom
			.workspace
			.getActiveTextEditor();
		const editorStyle = window.getComputedStyle(editor.element);
		const lineHeight = editorStyle.getPropertyValue("line-height");
		const codeLines = this.getCodeLines();
		const isBottom = this.props.data.y + codeLines.lines * parseFloat(lineHeight) >= editor.element.offsetHeight;

		const previewStyle = {
			left: this.props.data.x + "px",
			top: this.props.data.y - (isBottom && this.props.autoAlign
				? codeLines.lines * parseFloat(lineHeight)
				: 0) + "px",
			width: this.props.data.w + "px",
			borderColor: window
				.getComputedStyle($(".wrap-guide", editor.element).get(0))
				.getPropertyValue("background-color")
		};

		const blockStyle = {
			backgroundColor: editorStyle.getPropertyValue("background-color")
		};

		codeLines.html = codeLines
			.html
			.replace(/\$1/g, "&#32;");

		return (
			<div class="folded-code-preview" style={previewStyle}>
				<div class="gutter" innerHTML={codeLines.gutter}/>
				<div class="code-block" innerHTML={codeLines.html} style={blockStyle}/>
			</div>
		);
	}

	update(props) {
		if (typeof _ === "undefined")
			_ = require("lodash");

		_.merge(this.props, props);

		return etch.update(this);
	}

	async destroy() {
		await etch.destroy(this);
	}

	getCodeLines() {
		const editor = atom
			.workspace
			.getActiveTextEditor();
		const grammar = editor.tokenizedBuffer.grammar;

		if (typeof editor === "undefined")
			return {html: null, lines: 0, gutter: null};

		const lastLine = editor.getLastBufferRow();
		const foldStart = this.props.data.screenRow;
		const indentLevel = editor.indentationForBufferRow(foldStart);
		let foldEnd = lastLine - 1;

		// Find where the folded block ends
		for (let i = foldStart + 2; i <= lastLine; i++) {
			// Has to have the same indent
			if (editor.indentationForBufferRow(i - 1) !== indentLevel)
				continue;

			if (editor.isFoldedAtBufferRow(i - 1) && (editor.lineTextForBufferRow(i - 1).trim().length > 0 || i >= lastLine)) {
				foldEnd = i;
				break;
			}
		}

		const lines = [];
		const iterateEnd = this.autoAlign > 0
			? foldStart + this.autoAlign
			: foldEnd;

		for (let i = foldStart; i < iterateEnd; i++)
			lines.push(editor.lineTextForBufferRow(i));

		return {
			gutter: this.generateLineNumbers(foldStart + 2, foldEnd, editor),
			html: this.tokenizeBlock(lines.join("\r\n"), editor, grammar),
			lines: lines.length - 1
		};
	}

	// Hacky solution so the html code doesn't get recognised as actual html
	processCode(code) {
		return code
			.replace(/(^|\s)\$1\b/g, "\\$")
			.replace(/&#32;/g, "$1")
			.replace(/&(\w+;)/g, "&amp;$1")
			.replace(/</gi, "&lt;");
	}

	tokenizeBlock(blockLines, editor, grammar) {
		const lineBlocks = [];
		const tokenizedLines = this.wrapLines(grammar.tokenizeLines(blockLines));

		if (tokenizedLines.length <= 0)
			return '<span class=""></span>';

		const lineClasses = this.expandScopesToClass(tokenizedLines[0][0].scopes[0]);
		const indentLevel = editor.indentationForBufferRow(this.props.data.screenRow);

		tokenizedLines.forEach((line, tIndex) => {
			// Don't show the first line
			if (tIndex === 0)
				return;

			const lineElements = [];

			if (line.length === 1 && tIndex === tokenizedLines.length - 1) {
				if (line[0].value.match(/\S/gi) === null)
					return;
				}

			line.forEach((token, lIndex) => {
				let tokenValue = token.value;

				if (token.scopes[0] === tokenizedLines[0][0].scopes[0])
					token.scopes.splice(0, 1);

				if (tokenValue === "\n" || tokenValue === "\r" || tokenValue === "\r\n")
					return;

				const scopes = this.generateLineTokenScopes(token.scopes, tokenValue);

				lineElements.push(this.tokenScopesToElements(scopes));
			});

			if (lineElements.length <= 0) {
				const tabString = this.repeatString("&#32;", this.tabLength);

				for (let i = 0; i < indentLevel + 1; i++)
					lineElements.push(`<span class="indent-guide">${tabString}</span>`);
				}

			if (lineElements.length > 0)
				lineBlocks.push(`<span class="${lineClasses}">${lineElements.join("")}</span>`);
			}
		);

		return lineBlocks
			.map(line => `<div class="line">${line}</div>`)
			.join("");
	}

	generateLineTokenScopes(scopes, value) {
		const e = {};

		e[scopes[0]] = {};

		if (scopes.slice(1).length > 0)
			e[scopes[0]] = this.generateLineTokenScopes(scopes.slice(1), value);
		else if (value.length > 0)
			e[scopes[0]] = value;

		return e;
	}

	tokenScopesToElements(scopes) {
		let elem = ``;

		for (var prop in scopes) {
			if (!scopes.hasOwnProperty(prop))
				continue;

			const scopeClass = this.expandScopesToClass(prop);

			if (typeof scopes[prop] === "object")
				elem += this.tokenScopesToElements(scopes[prop]);
			else if (!scopes[prop].startsWith("\t"))
				elem += `<span class="${scopeClass}">${this.processCode(scopes[prop])}</span>`;
			else {
				const tabString = this.repeatString("&#32;", this.tabLength);
				const elementCount = scopes[prop]
					.match(/\t/g)
					.length;
				const tabElements = `<span class="hard-tab leading-whitespace indent-guide">${tabString}</span>`.repeat(elementCount);

				if (typeof prop !== "undefined" && prop !== "undefined")
					elem += `<span class="${scopeClass}">${tabElements}</span>`;
				else
					elem += tabElements;
				}
			}

		return elem;
	}

	generateLineNumbers(start, end, editor) {
		const lineElements = [];
		const digitCount = (editor.getLastBufferRow() + 1)
			.toString()
			.length;

		for (let i = start; i <= end; i++) {
			const lineNumberClass = "line-number " + (editor.isFoldableAtBufferRow(i - 1)
				? "foldable"
				: "");

			let lineElement = `<div class="${lineNumberClass}">`;
			const isMultilined = editor
				.lineTextForBufferRow(i - 2)
				.replace(/\t/g, " ".repeat(this.tabLength))
				.length >= this.preferredLineLength;

			if (isMultilined) {
				lineElement += `&nbsp;&nbsp;&bull;`;
				lineElement += `<div class="icon-right"></div>`;
				lineElement += `</div>`;
				lineElement += `<div class="${lineNumberClass}">`;
			}

			lineElement += `${this.repeatString("&nbsp;", digitCount - i.toString().length)}${i}`;
			lineElement += `<div class="icon-right"></div>`;
			lineElement += `</div>`;

			lineElements.push(lineElement);
		}

		if (typeof $ === "jquery")
			$ = require("jquery");

		const lineNumbersStyle = `padding-right: ${this.props.data.gutterWidth -
			$('.gutter.line-numbers', editor.element).outerWidth()}px;`;

		return `<div class="line-numbers" style="${lineNumbersStyle}">${lineElements.join("")}</div>`;
	}

	wrapLines(lines) {
		const linesSplit = [];

		lines.forEach(line => {
			const lineString = line
				.map(l => l.value)
				.join('')
				.replace(/\t/g, this.repeatString(" ", this.tabLength));
			const splits = this.wrapLinesToLength(lineString);
			const prependElemNext = null;

			splits.forEach(split => {
				linesSplit.push([]);

				let stringIndex = 0;

				line.forEach(token => {
					const tokenValue = token
						.value
						.replace(/\t/g, this.repeatString(" ", this.tabLength));

					if ((linesSplit[linesSplit.length - 1].length <= 0 && stringIndex + tokenValue.length >= split.start) || (stringIndex >= split.start && stringIndex + tokenValue.length <= split.end))
						linesSplit[linesSplit.length - 1].push(token);

					stringIndex += tokenValue.length;
				});

				if (split.start !== 0) {
					const indentLevel = lineString.match(/\s+/g)[0].length / this.tabLength;

					for (let i = 0; i < indentLevel; i++) {
						linesSplit[linesSplit.length - 1].unshift({scopes: ["meta.block.es"], value: "\t"});
					}

					linesSplit[linesSplit.length - 1].unshift({scopes: ["meta.block.es"], value: "\t"});
				}
			});
		});

		return linesSplit;
	}

	wrapLinesToLength(line) {
		if (line.length <= this.preferredLineLength)
			return [
				{
					start: 0,
					end: line.length
				}
			];

		const lineSplit = [];
		let index = 0;

		while (line.length > 0 || line.length <= this.preferredLineLength) {
			const currentLineWrap = line.substr(0, this.preferredLineLength);
			const wrapIndex = this.findLastIndex(currentLineWrap, "\\s", "g");

			if (wrapIndex >= line.length || wrapIndex <= 0)
				break;

			lineSplit.push({start: index, end: wrapIndex});

			index = wrapIndex;
			line = line.substr(wrapIndex, line.length - wrapIndex);
		}

		if (line.length > 0) {
			lineSplit.push({
				start: index,
				end: index + line.length
			});
		}

		return lineSplit;
	}

	findLastIndex(string, regex, mod) {
		const reg = new RegExp(regex, mod);
		let lastIndex = -1,
			tmp;

		while ((tmp = reg.exec(string)) !== null)
			lastIndex = reg.lastIndex;

		return lastIndex;
	}

	wrapLineText(line) {
		if (line.length <= this.preferredLineLength)
			return line;

		lineSplit = line.match(new RegExp(".{1," + this.preferredLineLength + "}", "g"));

		lineSplit.forEach((line, index, arr) => {
			if (index === 0)
				return;

			const tabString = this.repeatString("&#32;", this.tabLength);
			arr[index] = tabString + lineSplit;
		});

		return lineSplit.join("\r\n");
	}

	expandScopesToClass(scopes) {
		return scopes
			.split(".")
			.map(c => "syntax--" + c)
			.join(" ");
	}

	repeatString(string, amount) {
		return string.repeat(amount);
	}
}
