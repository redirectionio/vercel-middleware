async function getReleaseLine(changeset) {
    const [firstLine, ...futureLines] = changeset.summary.split("\n").map((l) => l.trimEnd());

    let returnVal = `-   ${firstLine}`;

    if (futureLines.length > 0) {
        returnVal += `\n${futureLines.map((l) => `    ${l}`).join("\n")}`;
    }

    return returnVal;
}

async function getDependencyReleaseLine(_changesets, dependenciesUpdated) {
    if (dependenciesUpdated.length === 0) return "";

    return dependenciesUpdated
        .map((dep) => `-   Updated dependency \`${dep.name}\` to \`${dep.newVersion}\``)
        .join("\n");
}

const defaultChangelogFunctions = {
    getReleaseLine,
    getDependencyReleaseLine,
};

module.exports = defaultChangelogFunctions;
