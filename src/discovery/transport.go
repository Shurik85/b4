package discovery

import (
	"context"
	"fmt"
	"net"
	"syscall"
	"time"

	"golang.org/x/sys/unix"
)

func markControl(mark uint) func(string, string, syscall.RawConn) error {
	return func(_, _ string, c syscall.RawConn) error {
		var ctrlErr error
		if err := c.Control(func(fd uintptr) {
			ctrlErr = unix.SetsockoptInt(int(fd), unix.SOL_SOCKET, unix.SO_MARK, int(mark))
		}); err != nil {
			return err
		}
		if ctrlErr != nil {
			return fmt.Errorf("failed to set SO_MARK=%d: %w", mark, ctrlErr)
		}
		return nil
	}
}

func markedDialer(mark uint, timeout, keepAlive time.Duration) *net.Dialer {
	return &net.Dialer{
		Timeout:   timeout,
		KeepAlive: keepAlive,
		Control:   markControl(mark),
	}
}

func markedResolver(mark uint, timeout time.Duration, server string) *net.Resolver {
	return &net.Resolver{
		PreferGo: true,
		Dial: func(ctx context.Context, network, addr string) (net.Conn, error) {
			d := markedDialer(mark, timeout, timeout)
			target := addr
			if server != "" {
				target = net.JoinHostPort(server, "53")
			}
			return d.DialContext(ctx, network, target)
		},
	}
}
