# Homebrew formula template for https://github.com/nannndev/homebrew-tap
# Place at: Formula/sevenserver.rb in nannndev/homebrew-tap
# (Automatically updated on release when HOMEBREW_TAP_TOKEN secret is configured.)
require "language/node"

class Sevenserver < Formula
  desc "Self-hosted dashboard for your servers: monitoring, terminal, Docker, Nginx, and AI gateway"
  homepage "https://github.com/nannndev/7server"
  url "https://github.com/nannndev/7server/releases/download/v0.3.1/sevenserver-0.3.1.tgz"
  sha256 "REPLACE_WITH_TARBALL_SHA256"
  license "MIT"

  depends_on "node"

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  service do
    run [opt_bin/"7server", "--host", "127.0.0.1", "--port", "5001", "--no-open", "--no-update-check"]
    keep_alive true
    working_dir var/"sevenserver"
    log_path var/"log/sevenserver.log"
    error_log_path var/"log/sevenserver.log"
  end

  test do
    assert_match version.to_s, shell_output("#{bin}/7server --version")
  end
end
