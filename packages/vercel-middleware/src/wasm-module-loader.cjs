module.exports = function (content) {
    const base64 = Buffer.from(content).toString("base64");
    return (
        'const bytes = Buffer.from("' + base64 + '", "base64");\n' + "module.exports = new WebAssembly.Module(bytes);\n"
    );
};

module.exports.raw = true;
