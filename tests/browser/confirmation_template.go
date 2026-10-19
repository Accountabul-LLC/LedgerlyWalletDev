// Run from the repository root: go run tests/browser/confirmation_template.go
// Render the actual Supabase HTML template using only standard Go template helpers.
package main

import (
	"bytes"
	"fmt"
	"html"
	"html/template"
	"os"
	"regexp"
)

func main() {
	source, err := os.ReadFile("supabase/templates/confirmation.html")
	if err != nil {
		panic(err)
	}
	tmpl, err := template.New("confirmation").Parse(string(source))
	if err != nil {
		panic(err)
	}
	cases := []struct{ site, redirect, expected string }{
		{"https://ledgerlywallet.com", "", "https://ledgerlywallet.com/auth/confirm?token_hash=synthetic&type=email"},
		{"https://ledgerlywallet.com/", "", "https://ledgerlywallet.com/auth/confirm?token_hash=synthetic&type=email"},
		{"https://ledgerlywallet.com/", "https://ledgerlywallet.com/", "https://ledgerlywallet.com/auth/confirm?token_hash=synthetic&type=email"},
		{"https://ledgerlywallet.com/", "https://ledgerlywallet.com", "https://ledgerlywallet.com/auth/confirm?token_hash=synthetic&type=email"},
		{"https://ledgerlywallet.com", "https://preview.example/auth/confirm?flow=native", "https://preview.example/auth/confirm?flow=native&token_hash=synthetic&type=email"},
	}
	href := regexp.MustCompile(`href="([^"]*token_hash[^"]*)"`)
	for _, c := range cases {
		var output bytes.Buffer
		err = tmpl.Execute(&output, map[string]string{"SiteURL": c.site, "RedirectTo": c.redirect, "TokenHash": "synthetic"})
		if err != nil {
			panic(err)
		}
		matches := href.FindStringSubmatch(output.String())
		if len(matches) != 2 || html.UnescapeString(matches[1]) != c.expected {
			panic(fmt.Sprintf("incorrect confirmation URL for site %q, redirect %q", c.site, c.redirect))
		}
	}
	fmt.Println("PASS: actual Go email template renders default, trailing-slash, explicit, and query redirects")
}
