import Foundation

// Runs ShellPolicy over inputs from standard input, one call per line, and
// prints one result per line, in the format of PolicyCheck.java.
// apps/mobile/src/native-policy.test.mjs builds this with
// `swiftc ../App/App/ShellPolicy.swift main.swift`.
//
// A line is a function name and its arguments, tab-separated, each argument
// base64-encoded UTF-8. A leading "-" marks a null argument.

func argument(_ fields: [String], _ index: Int) -> String? {
    let field = fields[index]
    if field == "-" { return nil }
    guard let data = Data(base64Encoded: field), let text = String(data: data, encoding: .utf8) else {
        fatalError("Malformed argument")
    }
    return text
}

func show(_ value: String?) -> String { value ?? "null" }

var output = ""
while let line = readLine(strippingNewline: true) {
    if line.isEmpty { continue }
    let fields = line.components(separatedBy: "\t")
    switch fields[0] {
    case "classifyOrigin":
        output += show(ShellPolicy.classifyOrigin(argument(fields, 1), allowPrivateLanHttp: fields[2] == "true"))
    case "sameOrigin":
        output += String(ShellPolicy.sameOrigin(argument(fields, 1), argument(fields, 2)))
    case "deepLinkTarget":
        output += show(ShellPolicy.deepLinkTarget(argument(fields, 1), origin: argument(fields, 2)))
    case "allowedExternalOAuth":
        output += String(ShellPolicy.allowedExternalOAuth(argument(fields, 1)))
    default:
        fatalError("Unknown function \(fields[0])")
    }
    output += "\n"
}
print(output, terminator: "")
