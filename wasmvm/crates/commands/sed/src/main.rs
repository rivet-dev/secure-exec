fn main() {
    let args: Vec<std::ffi::OsString> = std::env::args_os().collect();
    std::process::exit(sed::sed::uumain(args.into_iter()));
}
