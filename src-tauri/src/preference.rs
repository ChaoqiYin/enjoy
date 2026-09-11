use crate::error::AppError;

pub fn normalize(value: Option<&str>) -> String {
    value
        .filter(|value| ["system", "zh-CN", "en"].contains(value))
        .unwrap_or("system")
        .into()
}

pub fn commit<T>(
    current: &mut String,
    preference: &str,
    apply_menu: impl FnOnce() -> Result<T, AppError>,
    persist: impl FnOnce() -> Result<(), AppError>,
    restore_menu: impl FnOnce(T),
) -> Result<(), AppError> {
    if !["system", "zh-CN", "en"].contains(&preference) {
        return Err(AppError::new(
            "settings.language.invalid",
            "Invalid language preference",
        ));
    }
    let previous_menu = apply_menu()?;
    if let Err(error) = persist() {
        restore_menu(previous_menu);
        return Err(error);
    }
    *current = preference.into();
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::{commit, normalize};
    use crate::error::AppError;
    use std::cell::RefCell;

    #[test]
    fn failed_save_preserves_runtime_and_restores_menu() {
        let mut current = "zh-CN".to_owned();
        let menu = RefCell::new("zh-CN");
        let result = commit(
            &mut current,
            "en",
            || Ok(menu.replace("en")),
            || {
                Err(AppError::new(
                    "settings.language.save_failed",
                    "Simulated read-only storage",
                ))
            },
            |previous| {
                menu.replace(previous);
            },
        );
        assert_eq!(result.unwrap_err().code, "settings.language.save_failed");
        assert_eq!(current, "zh-CN");
        assert_eq!(*menu.borrow(), "zh-CN");
    }

    #[test]
    fn successful_save_commits_system_preference_without_resolving_it() {
        let mut current = "en".to_owned();
        let persisted = RefCell::new(String::new());
        commit(
            &mut current,
            "system",
            || Ok(()),
            || {
                *persisted.borrow_mut() = "system".into();
                Ok(())
            },
            |_| panic!("Successful saves must not roll back"),
        )
        .unwrap();
        assert_eq!(current, "system");
        assert_eq!(*persisted.borrow(), "system");
    }

    #[test]
    fn invalid_or_missing_values_fall_back_and_invalid_writes_do_not_run() {
        assert_eq!(normalize(None), "system");
        assert_eq!(normalize(Some("invalid")), "system");
        assert_eq!(normalize(Some("en")), "en");
        let mut current = "en".into();
        assert!(commit(
            &mut current,
            "fr",
            || -> Result<(), AppError> { panic!("Invalid input must not alter menus") },
            || panic!("Invalid input must not write storage"),
            |_| {}
        )
        .is_err());
        assert_eq!(current, "en");
    }
}
